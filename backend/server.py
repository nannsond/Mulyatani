from dotenv import load_dotenv
from pathlib import Path
import os

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from fastapi import FastAPI, APIRouter, HTTPException, Request, Depends, Response, UploadFile, File, Query
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr, BeforeValidator, ConfigDict
from typing import List, Optional, Annotated, Any
from bson import ObjectId
from datetime import datetime, timezone, timedelta
import logging
import jwt
import bcrypt
import random
import uuid
import requests
import re
from fastapi.responses import JSONResponse
from bson.errors import InvalidId

# ---------------- DB ----------------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = "HS256"

# ---------------- Object Storage ----------------
STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = "tokotani"
storage_key = None

def init_storage(force=False):
    global storage_key
    if storage_key and not force:
        return storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
    resp.raise_for_status()
    storage_key = resp.json()["storage_key"]
    return storage_key

def put_object(path, data, content_type):
    key = init_storage()
    resp = requests.put(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key, "Content-Type": content_type}, data=data, timeout=120)
    if resp.status_code == 404:
        key = init_storage(force=True)
        resp = requests.put(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key, "Content-Type": content_type}, data=data, timeout=120)
    resp.raise_for_status()
    return resp.json()

def get_object(path):
    key = init_storage()
    resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    if resp.status_code == 404:
        key = init_storage(force=True)
        resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")

app = FastAPI()
api_router = APIRouter(prefix="/api")

@app.exception_handler(InvalidId)
async def _invalid_id_handler(request, exc):
    return JSONResponse(status_code=400, content={"detail": "ID tidak valid"})

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

PyObjectId = Annotated[str, BeforeValidator(str)]

# ---------------- Helpers ----------------
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))

def create_access_token(user_id: str, email: str, role: str) -> str:
    payload = {"sub": user_id, "email": email, "role": role,
               "exp": datetime.now(timezone.utc) + timedelta(days=7), "type": "access"}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Tidak terautentikasi")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User tidak ditemukan")
        user["id"] = str(user["_id"])
        user.pop("_id", None)
        user.pop("password_hash", None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Sesi berakhir")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token tidak valid")

async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Akses khusus admin")
    return user

async def product_cost_map() -> dict:
    prods = await db.products.find().to_list(1000)
    return {str(p["_id"]): p.get("harga_beli", 0) for p in prods}

def tx_fraction(t: dict) -> float:
    """Portion of a transaction recognized as omzet/laba (cash basis).
    Online 'Selesai' sales are fully recognized; POS credit sales recognize
    only the paid portion (amount_paid/total), attributed to the sale's date."""
    if t.get("_online"):
        return 1.0
    total = t.get("total", 0) or 0
    if total <= 0:
        return 1.0
    paid = t.get("amount_paid", total)
    return max(0.0, min(paid / total, 1.0))

def compute_profit(txs: List[dict], cost: dict) -> float:
    laba = 0.0
    for t in txs:
        f = tx_fraction(t)
        for i in t["items"]:
            laba += f * i["qty"] * (i["harga"] - cost.get(i["product_id"], 0))
    return laba

# ---------------- Online channels & merge helpers ----------------
ONLINE_STATUSES = ["Diproses", "Dikirim", "Selesai", "Dikembalikan"]
DEFAULT_CHANNELS = [
    {"name": "Shopee", "color": "#EE4D2D", "active": True},
    {"name": "Tokopedia", "color": "#42B549", "active": True},
    {"name": "Lazada", "color": "#2E4CE5", "active": True},
    {"name": "TikTok Shop", "color": "#111827", "active": True},
]

async def get_channels_cfg() -> List[dict]:
    s = await db.settings.find_one({"key": "channels"})
    if not s or not s.get("list"):
        return [dict(c) for c in DEFAULT_CHANNELS]
    return s["list"]

def normalize_online(s: dict) -> dict:
    return {"id": str(s.get("_id", "")), "items": s.get("items", []),
            "total": s.get("omzet", 0), "payment_method": s.get("channel", "Online"),
            "created_at": s.get("created_at", ""), "total_fee": s.get("total_fee", 0), "_online": True}

async def fetch_online_selesai(prefix: str):
    rx = f"^{re.escape(prefix)}"
    docs = await db.ecommerce_sales.find({"status": "Selesai", "created_at": {"$regex": rx}}).to_list(20000)
    return [normalize_online(s) for s in docs], sum(s.get("total_fee", 0) for s in docs)

def laba_by_user(sales: List[dict], users: List[dict]) -> dict:
    """Attribute 'Selesai' sales to each user by user_id (legacy sales fall back to user_name)."""
    uid_name = {str(u["_id"]): u["name"] for u in users}
    name_uid = {}
    for u in users:
        name_uid.setdefault(u["name"], str(u["_id"]))
    out = {}
    for sl in sales:
        uid = sl.get("user_id")
        if not uid or uid not in uid_name:
            uid = name_uid.get(sl.get("user_name", ""))
        if not uid:
            continue
        e = out.setdefault(uid, {"user_id": uid, "user_name": uid_name.get(uid, sl.get("user_name", "-")),
                                 "transaksi": 0, "omzet": 0, "laba_kotor": 0})
        e["transaksi"] += 1
        e["omzet"] += sl.get("omzet", 0)
        e["laba_kotor"] += sl.get("laba_kotor", 0)
    return out

# ---------------- Models ----------------
class LoginInput(BaseModel):
    email: EmailStr
    password: str

class RegisterInput(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: str = "kasir"

class Product(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: Optional[PyObjectId] = Field(default=None, alias="_id")
    sku: str
    name: str
    category: str
    unit: str = "pcs"
    harga_beli: float = 0
    harga_jual: float = 0
    harga_reseller: float = 0
    stok: int = 0
    stok_minimal: int = 5

class ProductInput(BaseModel):
    sku: str
    name: str
    category: str
    unit: str = "pcs"
    harga_beli: float = 0
    harga_jual: float = 0
    harga_reseller: float = 0
    stok: int = 0
    stok_minimal: int = 5

class CartItem(BaseModel):
    product_id: str
    name: str
    qty: int
    harga: float

class TransactionInput(BaseModel):
    items: List[CartItem]
    payment_method: str = "Tunai"
    discount: float = 0
    discount_reason: str = ""
    customer_name: str = ""
    amount_paid: Optional[float] = None

class PaymentInput(BaseModel):
    amount: float

class OpnameInput(BaseModel):
    product_id: str
    stok_fisik: int
    alasan: str = "Penyesuaian"
    note: str = ""

# ---------------- Auth routes ----------------
@api_router.post("/auth/register")
async def register(data: RegisterInput, response: Response):
    email = data.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email sudah terdaftar")
    role = "kasir"  # SEC: role is never client-controlled; admins are created only via /api/users
    doc = {"email": email, "password_hash": hash_password(data.password),
           "name": data.name, "role": role, "created_at": now_iso()}
    res = await db.users.insert_one(doc)
    uid = str(res.inserted_id)
    token = create_access_token(uid, email, role)
    return {"token": token, "user": {"id": uid, "email": email, "name": data.name, "role": role}}

@api_router.post("/auth/login")
async def login(data: LoginInput):
    email = data.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Email atau password salah")
    uid = str(user["_id"])
    token = create_access_token(uid, email, user["role"])
    return {"token": token, "user": {"id": uid, "email": email, "name": user["name"], "role": user["role"]}}

@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user

# ---------------- Product routes ----------------
@api_router.get("/products")
async def list_products(user: dict = Depends(get_current_user)):
    docs = await db.products.find().collation({"locale": "en", "strength": 2}).sort([("category", 1), ("name", 1)]).to_list(1000)
    return [Product(**d).model_dump() for d in docs]

@api_router.post("/products")
async def create_product(data: ProductInput, admin: dict = Depends(require_admin)):
    if await db.products.find_one({"sku": data.sku}):
        raise HTTPException(status_code=400, detail="SKU sudah digunakan")
    doc = data.model_dump()
    res = await db.products.insert_one(doc)
    doc["_id"] = res.inserted_id
    return Product(**doc).model_dump()

@api_router.put("/products/{pid}")
async def update_product(pid: str, data: ProductInput, admin: dict = Depends(require_admin)):
    await db.products.update_one({"_id": ObjectId(pid)}, {"$set": data.model_dump()})
    doc = await db.products.find_one({"_id": ObjectId(pid)})
    if not doc:
        raise HTTPException(status_code=404, detail="Produk tidak ditemukan")
    return Product(**doc).model_dump()

@api_router.delete("/products/{pid}")
async def delete_product(pid: str, admin: dict = Depends(require_admin)):
    await db.products.delete_one({"_id": ObjectId(pid)})
    return {"ok": True}

# ---------------- Transaction routes ----------------
async def gen_invoice() -> str:
    count = await db.transactions.count_documents({})
    return f"INV-{datetime.now().strftime('%Y%m%d')}-{count + 1:04d}"

@api_router.post("/transactions")
async def create_transaction(data: TransactionInput, user: dict = Depends(get_current_user)):
    if not data.items:
        raise HTTPException(status_code=400, detail="Keranjang kosong")
    items = []
    subtotal = 0.0
    for it in data.items:
        line = it.qty * it.harga
        subtotal += line
        items.append({"product_id": it.product_id, "name": it.name, "qty": it.qty,
                      "harga": it.harga, "subtotal": line})
        await db.products.update_one({"_id": ObjectId(it.product_id)}, {"$inc": {"stok": -it.qty}})
    discount = max(0.0, min(data.discount, subtotal))
    total = subtotal - discount
    amount_paid = total if data.amount_paid is None else max(0.0, min(data.amount_paid, total))
    status = "lunas" if amount_paid >= total else ("sebagian" if amount_paid > 0 else "belum")
    doc = {"invoice_no": await gen_invoice(), "items": items, "subtotal": subtotal,
           "discount": discount, "discount_reason": data.discount_reason, "total": total,
           "payment_method": data.payment_method, "customer_name": data.customer_name,
           "amount_paid": amount_paid, "status": status, "payments": [],
           "cashier_id": user["id"], "cashier_name": user["name"], "created_at": now_iso()}
    res = await db.transactions.insert_one(doc)
    doc["id"] = str(res.inserted_id)
    doc.pop("_id", None)
    return doc

@api_router.get("/transactions")
async def list_transactions(date: Optional[str] = None, q: Optional[str] = None, limit: int = 50, user: dict = Depends(get_current_user)):
    query = {}
    if date:
        query["created_at"] = {"$regex": f"^{re.escape(date)}"}
    if q:
        query["invoice_no"] = {"$regex": re.escape(q), "$options": "i"}
    docs = await db.transactions.find(query).sort("created_at", -1).to_list(min(limit, 500))
    for d in docs:
        d["id"] = str(d["_id"])
        d.pop("_id", None)
    return docs

# ---------------- Reports ----------------
def summarize(txs: List[dict]) -> dict:
    total = 0.0
    qty = 0
    pay = {}
    for t in txs:
        f = tx_fraction(t)
        rec = t["total"] * f
        total += rec
        qty += sum(i["qty"] for i in t["items"])
        pay[t["payment_method"]] = pay.get(t["payment_method"], 0) + rec
    count = len(txs)
    return {"total_omzet": total, "jumlah_transaksi": count, "total_item": qty,
            "rata_rata": total / count if count else 0, "pembayaran": pay}

async def top_products(txs: List[dict], limit: int = 5):
    agg = {}
    for t in txs:
        f = tx_fraction(t)
        for i in t["items"]:
            e = agg.setdefault(i["name"], {"name": i["name"], "qty": 0, "omzet": 0})
            e["qty"] += i["qty"]
            e["omzet"] += i["subtotal"] * f
    return sorted(agg.values(), key=lambda x: x["omzet"], reverse=True)[:limit]

async def category_breakdown(txs: List[dict]):
    prods = {str(p["_id"]): p for p in await db.products.find().to_list(1000)}
    agg = {}
    for t in txs:
        f = tx_fraction(t)
        for i in t["items"]:
            cat = prods.get(i["product_id"], {}).get("category", "Lainnya")
            agg[cat] = agg.get(cat, 0) + i["subtotal"] * f
    return [{"category": k, "omzet": v} for k, v in sorted(agg.items(), key=lambda x: -x[1])]

async def product_profit(txs: List[dict], cost: dict, limit: int = 5):
    agg = {}
    for t in txs:
        f = tx_fraction(t)
        for i in t["items"]:
            hb = cost.get(i["product_id"], 0)
            e = agg.setdefault(i["name"], {"name": i["name"], "qty": 0, "omzet": 0, "laba": 0})
            e["qty"] += i["qty"]; e["omzet"] += i["subtotal"] * f
            e["laba"] += f * i["qty"] * (i["harga"] - hb)
    arr = sorted(agg.values(), key=lambda x: x["laba"], reverse=True)
    terendah = list(reversed(arr[-limit:])) if len(arr) > limit else list(reversed(arr))
    return {"tertinggi": arr[:limit], "terendah": terendah}

async def category_profit(txs: List[dict], cost: dict):
    prods = {str(p["_id"]): p for p in await db.products.find().to_list(1000)}
    agg = {}
    for t in txs:
        f = tx_fraction(t)
        for i in t["items"]:
            cat = prods.get(i["product_id"], {}).get("category", "Lainnya")
            e = agg.setdefault(cat, {"category": cat, "omzet": 0, "laba": 0})
            e["omzet"] += i["subtotal"] * f
            e["laba"] += f * i["qty"] * (i["harga"] - cost.get(i["product_id"], 0))
    return sorted(agg.values(), key=lambda x: x["laba"], reverse=True)

@api_router.get("/reports/daily")
async def report_daily(date: str, user: dict = Depends(get_current_user)):
    txs = await db.transactions.find({"created_at": {"$regex": f"^{re.escape(date)}"}}).sort("created_at", 1).to_list(2000)
    for t in txs:
        t["id"] = str(t["_id"]); t.pop("_id", None)
    online, online_fee = await fetch_online_selesai(date)
    all_txs = txs + online
    cost = await product_cost_map()
    s = summarize(all_txs); s["total_laba"] = compute_profit(all_txs, cost)
    s["biaya_marketplace"] = online_fee
    return {"date": date, "summary": s, "transactions": txs,
            "top_products": await top_products(all_txs), "categories": await category_breakdown(all_txs)}

@api_router.get("/reports/monthly")
async def report_monthly(year: int, month: int, user: dict = Depends(get_current_user)):
    prefix = f"{year}-{month:02d}"
    txs = await db.transactions.find({"created_at": {"$regex": f"^{prefix}"}}).to_list(5000)
    online, online_fee = await fetch_online_selesai(prefix)
    all_txs = txs + online
    cost = await product_cost_map()
    daily = {}
    for t in all_txs:
        f = tx_fraction(t)
        day = t["created_at"][:10]
        d = daily.setdefault(day, {"date": day, "omzet": 0, "transaksi": 0, "laba": 0})
        d["omzet"] += t["total"] * f; d["transaksi"] += 1
        d["laba"] += compute_profit([t], cost)
    s = summarize(all_txs); s["total_laba"] = compute_profit(all_txs, cost)
    peng = await db.expenses.find({"created_at": {"$regex": f"^{prefix}"}}).to_list(2000)
    s["total_pengeluaran"] = sum(e["amount"] for e in peng)
    s["biaya_marketplace"] = online_fee
    s["laba_bersih"] = s["total_laba"] - s["total_pengeluaran"] - online_fee
    target = await db.targets.find_one({"year": year, "month": month})
    return {"year": year, "month": month, "summary": s,
            "target_omzet": target["target_omzet"] if target else 0,
            "daily": sorted(daily.values(), key=lambda x: x["date"]),
            "product_laba": await product_profit(all_txs, cost),
            "category_laba": await category_profit(all_txs, cost),
            "top_products": await top_products(all_txs), "categories": await category_breakdown(all_txs)}

@api_router.get("/reports/yearly")
async def report_yearly(year: int, user: dict = Depends(get_current_user)):
    txs = await db.transactions.find({"created_at": {"$regex": f"^{year}"}}).to_list(20000)
    online_docs = await db.ecommerce_sales.find({"status": "Selesai", "created_at": {"$regex": f"^{year}"}}).to_list(20000)
    online_norm = [normalize_online(s) for s in online_docs]
    all_txs = txs + online_norm
    cost = await product_cost_map()
    monthly = {m: {"month": m, "omzet": 0, "transaksi": 0, "laba": 0} for m in range(1, 13)}
    for t in all_txs:
        f = tx_fraction(t)
        m = int(t["created_at"][5:7])
        monthly[m]["omzet"] += t["total"] * f; monthly[m]["transaksi"] += 1
        monthly[m]["laba"] += compute_profit([t], cost)
    s = summarize(all_txs); s["total_laba"] = compute_profit(all_txs, cost)
    peng = await db.expenses.find({"created_at": {"$regex": f"^{year}"}}).to_list(5000)
    s["total_pengeluaran"] = sum(e["amount"] for e in peng)
    online_fee_total = sum(s2.get("total_fee", 0) for s2 in online_docs)
    s["biaya_marketplace"] = online_fee_total
    s["laba_bersih"] = s["total_laba"] - s["total_pengeluaran"] - online_fee_total
    peng_by_month = {}
    for e in peng:
        em = int(e["created_at"][5:7])
        peng_by_month[em] = peng_by_month.get(em, 0) + e["amount"]
    fee_by_month = {}
    for s2 in online_docs:
        fm = int(s2["created_at"][5:7])
        fee_by_month[fm] = fee_by_month.get(fm, 0) + s2.get("total_fee", 0)
    for mm in range(1, 13):
        monthly[mm]["pengeluaran"] = peng_by_month.get(mm, 0)
        monthly[mm]["biaya_marketplace"] = fee_by_month.get(mm, 0)
        monthly[mm]["laba_bersih"] = monthly[mm]["laba"] - peng_by_month.get(mm, 0) - fee_by_month.get(mm, 0)
    target = await db.targets.find_one({"year": year, "month": 0})
    return {"year": year, "summary": s,
            "target_omzet": target["target_omzet"] if target else 0,
            "monthly": list(monthly.values()),
            "product_laba": await product_profit(all_txs, cost),
            "category_laba": await category_profit(all_txs, cost),
            "top_products": await top_products(all_txs, 8), "categories": await category_breakdown(all_txs)}

# ---------------- Users (admin) ----------------
class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: str = "kasir"

@api_router.get("/users")
async def list_users(admin: dict = Depends(require_admin)):
    docs = await db.users.find().sort("created_at", 1).to_list(500)
    return [{"id": str(d["_id"]), "email": d["email"], "name": d["name"],
             "role": d["role"], "created_at": d.get("created_at")} for d in docs]

@api_router.post("/users")
async def create_user(data: UserCreate, admin: dict = Depends(require_admin)):
    email = data.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email sudah terdaftar")
    doc = {"email": email, "password_hash": hash_password(data.password),
           "name": data.name, "role": data.role, "created_at": now_iso()}
    res = await db.users.insert_one(doc)
    return {"id": str(res.inserted_id), "email": email, "name": data.name, "role": data.role}

@api_router.put("/users/{uid}")
async def update_user(uid: str, data: UserCreate, admin: dict = Depends(require_admin)):
    update = {"name": data.name, "role": data.role, "email": data.email.lower()}
    if data.password:
        update["password_hash"] = hash_password(data.password)
    await db.users.update_one({"_id": ObjectId(uid)}, {"$set": update})
    return {"ok": True}

@api_router.delete("/users/{uid}")
async def delete_user(uid: str, admin: dict = Depends(require_admin)):
    if uid == admin["id"]:
        raise HTTPException(status_code=400, detail="Tidak bisa menghapus akun sendiri")
    await db.users.delete_one({"_id": ObjectId(uid)})
    return {"ok": True}

# ---------------- Targets ----------------
class TargetInput(BaseModel):
    year: int
    month: int
    target_omzet: float

@api_router.get("/targets")
async def get_target(year: int, month: int, user: dict = Depends(get_current_user)):
    t = await db.targets.find_one({"year": year, "month": month})
    return {"year": year, "month": month, "target_omzet": t["target_omzet"] if t else 0}

@api_router.post("/targets")
async def set_target(data: TargetInput, admin: dict = Depends(require_admin)):
    await db.targets.update_one({"year": data.year, "month": data.month},
                                {"$set": {"target_omzet": data.target_omzet}}, upsert=True)
    return {"ok": True}

# ---------------- Settings / Logo ----------------
class StoreInfo(BaseModel):
    store_name: str = ""
    address: str = ""
    phone: str = ""

@api_router.get("/settings")
async def get_settings(user: dict = Depends(get_current_user)):
    s = await db.settings.find_one({"key": "store"}) or {}
    return {"has_logo": bool(s.get("logo_path")),
            "logo_updated": s.get("updated_at"),
            "store_name": s.get("store_name", ""),
            "address": s.get("address", ""),
            "phone": s.get("phone", "")}

@api_router.post("/settings/info")
async def set_store_info(data: StoreInfo, admin: dict = Depends(require_admin)):
    await db.settings.update_one({"key": "store"},
        {"$set": {"store_name": data.store_name, "address": data.address, "phone": data.phone}}, upsert=True)
    return {"ok": True}

@api_router.post("/settings/logo")
async def upload_logo(file: UploadFile = File(...), admin: dict = Depends(require_admin)):
    ext = file.filename.split(".")[-1].lower() if "." in file.filename else "png"
    if ext not in ("png", "jpg", "jpeg", "webp"):
        raise HTTPException(status_code=400, detail="Format harus PNG/JPG/WEBP")
    data = await file.read()
    if len(data) > 2 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Ukuran maksimal 2MB")
    sig_ok = data[:8].startswith(b"\x89PNG") or data[:3] == b"\xff\xd8\xff" or (data[:4] == b"RIFF" and data[8:12] == b"WEBP")
    if not sig_ok:
        raise HTTPException(status_code=400, detail="File bukan gambar yang valid")
    ctype = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "webp": "image/webp"}[ext]
    path = f"{APP_NAME}/logo/{uuid.uuid4()}.{ext}"
    put_object(path, data, ctype)
    await db.settings.update_one({"key": "store"},
        {"$set": {"logo_path": path, "content_type": ctype, "updated_at": now_iso()}}, upsert=True)
    return {"ok": True, "updated_at": now_iso()}

@api_router.get("/settings/logo")
async def get_logo():
    s = await db.settings.find_one({"key": "store"})
    if not s or not s.get("logo_path"):
        raise HTTPException(status_code=404, detail="Logo belum diset")
    data, ct = get_object(s["logo_path"])
    mt = s.get("content_type") or ct
    if not str(mt).startswith("image/"):
        mt = "image/png"
    return Response(content=data, media_type=mt)

# ---------------- Piutang (receivables from sales) ----------------
@api_router.get("/piutang")
async def list_piutang(user: dict = Depends(get_current_user)):
    docs = await db.transactions.find({"status": {"$in": ["belum", "sebagian"]}}).sort("created_at", -1).to_list(500)
    out = []
    for d in docs:
        d["id"] = str(d["_id"]); d.pop("_id", None)
        d["sisa"] = d["total"] - d.get("amount_paid", 0)
        out.append(d)
    return out

@api_router.post("/transactions/{tid}/pay")
async def pay_transaction(tid: str, data: PaymentInput, user: dict = Depends(get_current_user)):
    t = await db.transactions.find_one({"_id": ObjectId(tid)})
    if not t:
        raise HTTPException(status_code=404, detail="Transaksi tidak ditemukan")
    paid = min(t.get("amount_paid", 0) + data.amount, t["total"])
    status = "lunas" if paid >= t["total"] else ("sebagian" if paid > 0 else "belum")
    payments = t.get("payments", []) + [{"amount": data.amount, "date": now_iso(), "by": user["name"]}]
    await db.transactions.update_one({"_id": ObjectId(tid)}, {"$set": {"amount_paid": paid, "status": status, "payments": payments}})
    return {"ok": True, "amount_paid": paid, "status": status}

# ---------------- Pembelian (purchases) ----------------
class PurchaseItem(BaseModel):
    product_id: str
    name: str
    qty: int
    harga_beli: float

class PurchaseInput(BaseModel):
    supplier: str
    items: List[PurchaseItem]
    amount_paid: Optional[float] = None
    note: str = ""

async def gen_purchase_no():
    count = await db.purchases.count_documents({})
    return f"PO-{datetime.now().strftime('%Y%m%d')}-{count + 1:04d}"

@api_router.post("/purchases")
async def create_purchase(data: PurchaseInput, admin: dict = Depends(require_admin)):
    if not data.items:
        raise HTTPException(status_code=400, detail="Item pembelian kosong")
    items = []
    total = 0.0
    for it in data.items:
        line = it.qty * it.harga_beli
        total += line
        items.append({"product_id": it.product_id, "name": it.name, "qty": it.qty,
                      "harga_beli": it.harga_beli, "subtotal": line})
        await db.products.update_one({"_id": ObjectId(it.product_id)},
                                     {"$inc": {"stok": it.qty}, "$set": {"harga_beli": it.harga_beli}})
    amount_paid = total if data.amount_paid is None else max(0.0, min(data.amount_paid, total))
    status = "lunas" if amount_paid >= total else ("sebagian" if amount_paid > 0 else "belum")
    doc = {"po_no": await gen_purchase_no(), "supplier": data.supplier, "items": items, "total": total,
           "amount_paid": amount_paid, "status": status, "payments": [], "note": data.note,
           "user_name": admin["name"], "created_at": now_iso()}
    res = await db.purchases.insert_one(doc)
    doc["id"] = str(res.inserted_id); doc.pop("_id", None)
    return doc

@api_router.get("/purchases")
async def list_purchases(month: Optional[str] = None, user: dict = Depends(get_current_user)):
    q = {}
    if month:
        q = {"created_at": {"$regex": f"^{re.escape(month)}"}}
    docs = await db.purchases.find(q).sort("created_at", -1).to_list(500)
    for d in docs:
        d["id"] = str(d["_id"]); d.pop("_id", None)
    return docs

@api_router.get("/hutang")
async def list_hutang(user: dict = Depends(get_current_user)):
    docs = await db.purchases.find({"status": {"$in": ["belum", "sebagian"]}}).sort("created_at", -1).to_list(500)
    out = []
    for d in docs:
        d["id"] = str(d["_id"]); d.pop("_id", None)
        d["sisa"] = d["total"] - d.get("amount_paid", 0)
        out.append(d)
    return out

@api_router.post("/purchases/{pid}/pay")
async def pay_purchase(pid: str, data: PaymentInput, user: dict = Depends(get_current_user)):
    p = await db.purchases.find_one({"_id": ObjectId(pid)})
    if not p:
        raise HTTPException(status_code=404, detail="Pembelian tidak ditemukan")
    paid = min(p.get("amount_paid", 0) + data.amount, p["total"])
    status = "lunas" if paid >= p["total"] else ("sebagian" if paid > 0 else "belum")
    payments = p.get("payments", []) + [{"amount": data.amount, "date": now_iso(), "by": user["name"]}]
    await db.purchases.update_one({"_id": ObjectId(pid)}, {"$set": {"amount_paid": paid, "status": status, "payments": payments}})
    return {"ok": True, "amount_paid": paid, "status": status}

# ---------------- Pengeluaran (expenses) ----------------
class ExpenseInput(BaseModel):
    category: str
    amount: float
    note: str = ""
    date: Optional[str] = None

@api_router.post("/expenses")
async def create_expense(data: ExpenseInput, admin: dict = Depends(require_admin)):
    created = data.date or now_iso()
    if len(created) == 10:
        created = created + "T00:00:00+00:00"
    doc = {"category": data.category, "amount": data.amount, "note": data.note,
           "user_name": admin["name"], "created_at": created}
    res = await db.expenses.insert_one(doc)
    doc["id"] = str(res.inserted_id); doc.pop("_id", None)
    return doc

@api_router.get("/expenses")
async def list_expenses(month: Optional[str] = None, user: dict = Depends(get_current_user)):
    q = {}
    if month:
        q = {"created_at": {"$regex": f"^{re.escape(month)}"}}
    docs = await db.expenses.find(q).sort("created_at", -1).to_list(1000)
    for d in docs:
        d["id"] = str(d["_id"]); d.pop("_id", None)
    return docs

@api_router.delete("/expenses/{eid}")
async def delete_expense(eid: str, admin: dict = Depends(require_admin)):
    await db.expenses.delete_one({"_id": ObjectId(eid)})
    return {"ok": True}

# ---------------- Stok Opname ----------------
@api_router.get("/stok-opname")
async def list_opname(user: dict = Depends(get_current_user)):
    docs = await db.stok_opname.find().sort("created_at", -1).to_list(1000)
    for d in docs:
        d["id"] = str(d["_id"]); d.pop("_id", None)
    return docs

@api_router.post("/stok-opname")
async def create_opname(data: OpnameInput, user: dict = Depends(get_current_user)):
    prod = await db.products.find_one({"_id": ObjectId(data.product_id)})
    if not prod:
        raise HTTPException(status_code=404, detail="Produk tidak ditemukan")
    sistem = prod["stok"]
    selisih = data.stok_fisik - sistem
    doc = {"product_id": data.product_id, "product_name": prod["name"], "sku": prod["sku"],
           "stok_sistem": sistem, "stok_fisik": data.stok_fisik, "selisih": selisih,
           "alasan": data.alasan, "note": data.note, "user_name": user["name"],
           "created_at": now_iso()}
    res = await db.stok_opname.insert_one(doc)
    await db.products.update_one({"_id": ObjectId(data.product_id)}, {"$set": {"stok": data.stok_fisik}})
    doc["id"] = str(res.inserted_id); doc.pop("_id", None)
    return doc

# ---------------- Penjualan Online (E-commerce) ----------------

class EcomItem(BaseModel):
    product_id: str
    name: str
    qty: int
    harga: float

class EcomSaleInput(BaseModel):
    channel: str
    items: List[EcomItem]
    admin_fee: float = 0
    ongkir: float = 0
    biaya_lain: float = 0
    customer_name: str = ""
    order_no: str = ""
    date: Optional[str] = None

async def gen_ecom_no():
    count = await db.ecommerce_sales.count_documents({})
    return f"ECOM-{datetime.now().strftime('%Y%m%d')}-{count + 1:04d}"

@api_router.post("/ecommerce/sales")
async def create_ecom_sale(data: EcomSaleInput, user: dict = Depends(get_current_user)):
    names = [c["name"] for c in await get_channels_cfg()]
    if data.channel not in names:
        raise HTTPException(status_code=400, detail="Channel tidak valid")
    if not data.items:
        raise HTTPException(status_code=400, detail="Item penjualan kosong")
    cost = await product_cost_map()
    items = []
    omzet = 0.0
    hpp = 0.0
    for it in data.items:
        line = it.qty * it.harga
        omzet += line
        hpp += it.qty * cost.get(it.product_id, 0)
        items.append({"product_id": it.product_id, "name": it.name, "qty": it.qty,
                      "harga": it.harga, "subtotal": line})
        await db.products.update_one({"_id": ObjectId(it.product_id)}, {"$inc": {"stok": -it.qty}})
    admin_fee = max(0.0, data.admin_fee)
    ongkir = max(0.0, data.ongkir)
    biaya_lain = max(0.0, data.biaya_lain)
    total_fee = admin_fee + ongkir + biaya_lain
    laba_kotor = omzet - hpp
    laba_bersih = laba_kotor - total_fee
    created = data.date or now_iso()
    if len(created) == 10:
        created = created + "T00:00:00+00:00"
    doc = {"ecom_no": await gen_ecom_no(), "channel": data.channel, "items": items,
           "omzet": omzet, "hpp": hpp, "laba_kotor": laba_kotor,
           "admin_fee": admin_fee, "ongkir": ongkir, "biaya_lain": biaya_lain,
           "total_fee": total_fee, "laba_bersih": laba_bersih,
           "customer_name": data.customer_name, "order_no": data.order_no,
           "status": "Diproses",
           "user_id": user["id"], "user_name": user["name"], "created_at": created}
    res = await db.ecommerce_sales.insert_one(doc)
    doc["id"] = str(res.inserted_id); doc.pop("_id", None)
    return doc

@api_router.get("/ecommerce/sales")
async def list_ecom_sales(month: Optional[str] = None, channel: Optional[str] = None, limit: int = 200, user: dict = Depends(get_current_user)):
    q = {}
    if month:
        q["created_at"] = {"$regex": f"^{re.escape(month)}"}
    if channel:
        q["channel"] = channel
    docs = await db.ecommerce_sales.find(q).sort("created_at", -1).to_list(min(limit, 500))
    for d in docs:
        d["id"] = str(d["_id"]); d.pop("_id", None)
    return docs

@api_router.delete("/ecommerce/sales/{sid}")
async def delete_ecom_sale(sid: str, admin: dict = Depends(require_admin)):
    doc = await db.ecommerce_sales.find_one({"_id": ObjectId(sid)})
    if not doc:
        raise HTTPException(status_code=404, detail="Penjualan tidak ditemukan")
    for i in doc.get("items", []):
        await db.products.update_one({"_id": ObjectId(i["product_id"])}, {"$inc": {"stok": i["qty"]}})
    await db.ecommerce_sales.delete_one({"_id": ObjectId(sid)})
    return {"ok": True}

class EcomStatusInput(BaseModel):
    status: str
    restore_stock: bool = False

@api_router.put("/ecommerce/sales/{sid}/status")
async def update_ecom_status(sid: str, data: EcomStatusInput, admin: dict = Depends(require_admin)):
    if data.status not in ONLINE_STATUSES:
        raise HTTPException(status_code=400, detail="Status tidak valid")
    doc = await db.ecommerce_sales.find_one({"_id": ObjectId(sid)})
    if not doc:
        raise HTTPException(status_code=404, detail="Penjualan tidak ditemukan")
    update = {"status": data.status}
    if data.status == "Dikembalikan" and data.restore_stock and not doc.get("stock_restored"):
        for i in doc.get("items", []):
            await db.products.update_one({"_id": ObjectId(i["product_id"])}, {"$inc": {"stok": i["qty"]}})
        update["stock_restored"] = True
    await db.ecommerce_sales.update_one({"_id": ObjectId(sid)}, {"$set": update})
    return {"ok": True, "status": data.status, "stock_restored": update.get("stock_restored", doc.get("stock_restored", False))}

class EcomBulkRow(BaseModel):
    channel: str
    sku: str
    qty: int
    harga: float
    admin_fee: float = 0
    ongkir: float = 0
    biaya_lain: float = 0
    date: Optional[str] = None

class EcomBulkInput(BaseModel):
    rows: List[EcomBulkRow]

@api_router.post("/ecommerce/sales/bulk")
async def bulk_ecom_sales(data: EcomBulkInput, admin: dict = Depends(require_admin)):
    names = [c["name"] for c in await get_channels_cfg()]
    cost = await product_cost_map()
    prods = {p["sku"]: p for p in await db.products.find().to_list(5000)}
    created = 0
    errors = []
    for idx, r in enumerate(data.rows, start=1):
        if r.channel not in names:
            errors.append(f"Baris {idx}: channel '{r.channel}' tidak dikenal"); continue
        p = prods.get(r.sku)
        if not p:
            errors.append(f"Baris {idx}: SKU '{r.sku}' tidak ditemukan"); continue
        if r.qty <= 0:
            errors.append(f"Baris {idx}: qty tidak valid"); continue
        pid = str(p["_id"])
        omzet = r.qty * r.harga
        hpp = r.qty * cost.get(pid, p.get("harga_beli", 0))
        total_fee = max(0.0, r.admin_fee) + max(0.0, r.ongkir) + max(0.0, r.biaya_lain)
        laba_kotor = omzet - hpp
        created_at = r.date or now_iso()
        if len(created_at) == 10:
            created_at = created_at + "T00:00:00+00:00"
        doc = {"ecom_no": await gen_ecom_no(), "channel": r.channel,
               "items": [{"product_id": pid, "name": p["name"], "qty": r.qty, "harga": r.harga, "subtotal": omzet}],
               "omzet": omzet, "hpp": hpp, "laba_kotor": laba_kotor,
               "admin_fee": max(0.0, r.admin_fee), "ongkir": max(0.0, r.ongkir), "biaya_lain": max(0.0, r.biaya_lain),
               "total_fee": total_fee, "laba_bersih": laba_kotor - total_fee,
               "customer_name": "", "order_no": "", "status": "Diproses",
               "user_id": admin["id"], "user_name": admin["name"], "created_at": created_at}
        await db.ecommerce_sales.insert_one(doc)
        await db.products.update_one({"_id": ObjectId(pid)}, {"$inc": {"stok": -r.qty}})
        created += 1
    return {"created": created, "errors": errors}

class EcomTargetInput(BaseModel):
    channel: str
    year: int
    month: int
    target_omzet: float

@api_router.get("/ecommerce/targets")
async def get_ecom_targets(year: int, month: int, user: dict = Depends(get_current_user)):
    docs = await db.channel_targets.find({"year": year, "month": month}).to_list(200)
    return {d["channel"]: d["target_omzet"] for d in docs}

@api_router.post("/ecommerce/targets")
async def set_ecom_target(data: EcomTargetInput, admin: dict = Depends(require_admin)):
    await db.channel_targets.update_one({"channel": data.channel, "year": data.year, "month": data.month},
                                        {"$set": {"target_omzet": data.target_omzet}}, upsert=True)
    return {"ok": True}

# ---------------- Channels management ----------------
class ChannelInput(BaseModel):
    name: str
    color: str = "#64748b"

class ChannelUpdate(BaseModel):
    active: Optional[bool] = None
    color: Optional[str] = None

@api_router.get("/channels")
async def list_channels(user: dict = Depends(get_current_user)):
    return await get_channels_cfg()

@api_router.post("/channels")
async def add_channel(data: ChannelInput, admin: dict = Depends(require_admin)):
    cfg = await get_channels_cfg()
    if any(c["name"].lower() == data.name.lower() for c in cfg):
        raise HTTPException(status_code=400, detail="Channel sudah ada")
    cfg.append({"name": data.name, "color": data.color, "active": True})
    await db.settings.update_one({"key": "channels"}, {"$set": {"list": cfg}}, upsert=True)
    return {"ok": True, "list": cfg}

@api_router.put("/channels/{name}")
async def update_channel(name: str, data: ChannelUpdate, admin: dict = Depends(require_admin)):
    cfg = await get_channels_cfg()
    found = False
    for c in cfg:
        if c["name"] == name:
            if data.active is not None:
                c["active"] = data.active
            if data.color is not None:
                c["color"] = data.color
            found = True
    if not found:
        raise HTTPException(status_code=404, detail="Channel tidak ditemukan")
    await db.settings.update_one({"key": "channels"}, {"$set": {"list": cfg}}, upsert=True)
    return {"ok": True, "list": cfg}

@api_router.delete("/channels/{name}")
async def delete_channel(name: str, admin: dict = Depends(require_admin)):
    cfg = await get_channels_cfg()
    new = [c for c in cfg if c["name"] != name]
    if len(new) == len(cfg):
        raise HTTPException(status_code=404, detail="Channel tidak ditemukan")
    await db.settings.update_one({"key": "channels"}, {"$set": {"list": new}}, upsert=True)
    return {"ok": True, "list": new}

def ecom_channel_agg(sales: List[dict], names: List[str]):
    agg = {n: {"channel": n, "omzet": 0, "fee": 0, "laba_kotor": 0, "laba_bersih": 0, "transaksi": 0, "item": 0} for n in names}
    for s in sales:
        c = s["channel"]
        e = agg.setdefault(c, {"channel": c, "omzet": 0, "fee": 0, "laba_kotor": 0, "laba_bersih": 0, "transaksi": 0, "item": 0})
        e["omzet"] += s.get("omzet", 0); e["fee"] += s.get("total_fee", 0)
        e["laba_kotor"] += s.get("laba_kotor", 0); e["laba_bersih"] += s.get("laba_bersih", 0)
        e["transaksi"] += 1; e["item"] += sum(i["qty"] for i in s.get("items", []))
    return list(agg.values())

def ecom_summary(sales: List[dict]):
    return {"omzet": sum(s.get("omzet", 0) for s in sales),
            "fee": sum(s.get("total_fee", 0) for s in sales),
            "laba_kotor": sum(s.get("laba_kotor", 0) for s in sales),
            "laba_bersih": sum(s.get("laba_bersih", 0) for s in sales),
            "transaksi": len(sales),
            "item": sum(i["qty"] for s in sales for i in s.get("items", []))}

@api_router.get("/ecommerce/reports")
async def ecom_reports(mode: str = "bulanan", date: Optional[str] = None, year: Optional[int] = None, month: Optional[int] = None, status: Optional[str] = None, user: dict = Depends(get_current_user)):
    y = year or datetime.now().year
    m = month or datetime.now().month
    if mode == "harian":
        prefix = date or datetime.now(timezone.utc).strftime("%Y-%m-%d")
        periode = prefix
    elif mode == "tahunan":
        prefix = f"{y}"
        periode = f"Tahun {y}"
    else:
        prefix = f"{y}-{m:02d}"
        periode = f"{y}-{m:02d}"
    all_period = await db.ecommerce_sales.find({"created_at": {"$regex": f"^{re.escape(prefix)}"}}).to_list(20000)
    status_counts = {}
    for sp in all_period:
        st = sp.get("status", "Diproses")
        status_counts[st] = status_counts.get(st, 0) + 1
    sales = all_period if not status else [sp for sp in all_period if sp.get("status") == status]
    cfg = await get_channels_cfg()
    colors = {c["name"]: c.get("color", "#64748b") for c in cfg}
    names = [c["name"] for c in cfg]
    for sp in sales:
        if sp["channel"] not in names:
            names.append(sp["channel"]); colors.setdefault(sp["channel"], "#64748b")
    channels = ecom_channel_agg(sales, names)
    if mode == "bulanan":
        tg = {d["channel"]: d["target_omzet"] for d in await db.channel_targets.find({"year": y, "month": m}).to_list(200)}
        for c in channels:
            c["target"] = tg.get(c["channel"], 0)
    series = []
    if mode == "bulanan":
        buckets = {}
        for sp in sales:
            day = sp["created_at"][8:10]
            b = buckets.setdefault(day, {})
            b[sp["channel"]] = b.get(sp["channel"], 0) + sp.get("omzet", 0)
        series = [{"label": k, **{n: buckets[k].get(n, 0) for n in names}} for k in sorted(buckets)]
    elif mode == "tahunan":
        buckets = {}
        for sp in sales:
            mo = f"{int(sp['created_at'][5:7]):02d}"
            b = buckets.setdefault(mo, {})
            b[sp["channel"]] = b.get(sp["channel"], 0) + sp.get("omzet", 0)
        series = [{"label": k, **{n: buckets[k].get(n, 0) for n in names}} for k in sorted(buckets)]
    return {"mode": mode, "periode": periode, "summary": ecom_summary(sales),
            "channels": channels, "series": series, "channel_names": names,
            "channel_colors": colors, "status_counts": status_counts}

# ---------------- Dashboard ----------------
@api_router.get("/dashboard")
async def dashboard(user: dict = Depends(get_current_user)):
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    today_txs = await db.transactions.find({"created_at": {"$regex": f"^{today}"}}).to_list(2000)
    online_today, _ = await fetch_online_selesai(today)
    today_all = today_txs + online_today
    products = await db.products.find().to_list(1000)
    low_stock = [Product(**p).model_dump() for p in products if p["stok"] <= p["stok_minimal"]]
    # last 7 days
    series = []
    for i in range(6, -1, -1):
        day = (datetime.now(timezone.utc) - timedelta(days=i)).strftime("%Y-%m-%d")
        dtx = await db.transactions.find({"created_at": {"$regex": f"^{day}"}}).to_list(2000)
        online_day, _ = await fetch_online_selesai(day)
        combined = dtx + online_day
        series.append({"date": day, "omzet": sum(t["total"] * tx_fraction(t) for t in combined), "transaksi": len(combined)})
    return {"today": summarize(today_all), "low_stock": low_stock,
            "total_produk": len(products), "series7": series,
            "top_products": await top_products(today_all)}

# ---------------- Komisi (commission for online sales) ----------------
class CommissionSetting(BaseModel):
    rate: float

@api_router.get("/commission/settings")
async def get_commission(user: dict = Depends(get_current_user)):
    s = await db.settings.find_one({"key": "commission"})
    return {"rate": (s or {}).get("rate", 0)}

@api_router.post("/commission/settings")
async def set_commission(data: CommissionSetting, admin: dict = Depends(require_admin)):
    rate = max(0.0, data.rate)
    await db.settings.update_one({"key": "commission"}, {"$set": {"rate": rate}}, upsert=True)
    return {"ok": True, "rate": rate}

@api_router.get("/commission/report")
async def commission_report(month: str, admin: dict = Depends(require_admin)):
    s = await db.settings.find_one({"key": "commission"})
    rate = (s or {}).get("rate", 0)
    sales = await db.ecommerce_sales.find({"status": "Selesai", "created_at": {"$regex": f"^{re.escape(month)}"}}).to_list(20000)
    users = await db.users.find().sort("created_at", 1).to_list(500)
    agg = laba_by_user(sales, users)
    rows = []
    for e in agg.values():
        if e["transaksi"] == 0:
            continue
        e["komisi"] = e["laba_kotor"] * rate / 100
        rows.append(e)
    rows.sort(key=lambda x: x["komisi"], reverse=True)
    total = {"transaksi": sum(r["transaksi"] for r in rows), "omzet": sum(r["omzet"] for r in rows),
             "laba_kotor": sum(r["laba_kotor"] for r in rows), "komisi": sum(r["komisi"] for r in rows)}
    return {"month": month, "rate": rate, "rows": rows, "total": total}

# ---------------- Kehadiran (employee attendance) ----------------
WIB = timezone(timedelta(hours=7))

def wib_now():
    return datetime.now(WIB)

class AttendanceSetting(BaseModel):
    start_time: str = "08:00"

async def get_attendance_start():
    s = await db.settings.find_one({"key": "attendance"})
    return (s or {}).get("start_time", "08:00")

@api_router.get("/attendance/settings")
async def get_att_settings(user: dict = Depends(get_current_user)):
    return {"start_time": await get_attendance_start()}

@api_router.post("/attendance/settings")
async def set_att_settings(data: AttendanceSetting, admin: dict = Depends(require_admin)):
    await db.settings.update_one({"key": "attendance"}, {"$set": {"start_time": data.start_time}}, upsert=True)
    return {"ok": True, "start_time": data.start_time}

@api_router.get("/attendance/today")
async def attendance_today(user: dict = Depends(get_current_user)):
    today = wib_now().strftime("%Y-%m-%d")
    doc = await db.attendance.find_one({"user_id": user["id"], "date": today})
    if doc:
        doc["id"] = str(doc["_id"]); doc.pop("_id", None)
    return {"date": today, "record": doc}

@api_router.post("/attendance/checkin")
async def attendance_checkin(user: dict = Depends(get_current_user)):
    now = wib_now()
    today = now.strftime("%Y-%m-%d")
    existing = await db.attendance.find_one({"user_id": user["id"], "date": today})
    if existing:
        raise HTTPException(status_code=400, detail="Anda sudah absen masuk hari ini")
    start = await get_attendance_start()
    sh, sm = [int(x) for x in start.split(":")]
    late = (now.hour, now.minute) > (sh, sm)
    doc = {"user_id": user["id"], "user_name": user["name"], "date": today,
           "check_in": now.isoformat(), "check_out": None, "work_minutes": 0,
           "late": late, "status": "Hadir", "created_at": now.isoformat()}
    res = await db.attendance.insert_one(doc)
    doc["id"] = str(res.inserted_id); doc.pop("_id", None)
    return doc

@api_router.post("/attendance/checkout")
async def attendance_checkout(user: dict = Depends(get_current_user)):
    now = wib_now()
    today = now.strftime("%Y-%m-%d")
    doc = await db.attendance.find_one({"user_id": user["id"], "date": today})
    if not doc:
        raise HTTPException(status_code=400, detail="Anda belum absen masuk hari ini")
    if doc.get("check_out"):
        raise HTTPException(status_code=400, detail="Anda sudah absen pulang hari ini")
    ci = datetime.fromisoformat(doc["check_in"])
    minutes = max(0, int((now - ci).total_seconds() // 60))
    await db.attendance.update_one({"_id": doc["_id"]}, {"$set": {"check_out": now.isoformat(), "work_minutes": minutes}})
    doc["check_out"] = now.isoformat(); doc["work_minutes"] = minutes
    doc["id"] = str(doc["_id"]); doc.pop("_id", None)
    return doc

class AttendanceMark(BaseModel):
    date: str
    status: str
    user_id: Optional[str] = None

@api_router.post("/attendance/mark")
async def attendance_mark(data: AttendanceMark, user: dict = Depends(get_current_user)):
    if data.status not in ["Hadir", "Izin", "Sakit", "Alpha"]:
        raise HTTPException(status_code=400, detail="Status tidak valid")
    target_uid = user["id"]; target_name = user["name"]
    if data.user_id and data.user_id != user["id"]:
        if user.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Akses khusus admin")
        tu = await db.users.find_one({"_id": ObjectId(data.user_id)})
        if not tu:
            raise HTTPException(status_code=404, detail="Karyawan tidak ditemukan")
        target_uid = str(tu["_id"]); target_name = tu["name"]
    doc = {"user_id": target_uid, "user_name": target_name, "date": data.date, "status": data.status,
           "check_in": None, "check_out": None, "work_minutes": 0, "late": False, "created_at": wib_now().isoformat()}
    await db.attendance.update_one({"user_id": target_uid, "date": data.date}, {"$set": doc}, upsert=True)
    return {"ok": True, "status": data.status}

class AttendanceEdit(BaseModel):
    status: str
    check_in: Optional[str] = None
    check_out: Optional[str] = None

def _wib_dt(date: str, hhmm: str):
    return datetime.fromisoformat(f"{date}T{hhmm}:00+07:00")

@api_router.put("/attendance/{aid}")
async def attendance_edit(aid: str, data: AttendanceEdit, admin: dict = Depends(require_admin)):
    if data.status not in ["Hadir", "Izin", "Sakit", "Alpha"]:
        raise HTTPException(status_code=400, detail="Status tidak valid")
    doc = await db.attendance.find_one({"_id": ObjectId(aid)})
    if not doc:
        raise HTTPException(status_code=404, detail="Catatan tidak ditemukan")
    upd = {"status": data.status, "check_in": None, "check_out": None, "work_minutes": 0, "late": False}
    if data.status == "Hadir":
        if not data.check_in:
            raise HTTPException(status_code=400, detail="Jam masuk wajib diisi untuk status Hadir")
        ci = _wib_dt(doc["date"], data.check_in)
        start = await get_attendance_start()
        sh, sm = [int(x) for x in start.split(":")]
        upd["check_in"] = ci.isoformat()
        upd["late"] = (ci.hour, ci.minute) > (sh, sm)
        if data.check_out:
            co = _wib_dt(doc["date"], data.check_out)
            if co < ci:
                raise HTTPException(status_code=400, detail="Jam pulang harus setelah jam masuk")
            upd["check_out"] = co.isoformat()
            upd["work_minutes"] = max(0, int((co - ci).total_seconds() // 60))
    await db.attendance.update_one({"_id": ObjectId(aid)}, {"$set": upd})
    return {"ok": True}

@api_router.delete("/attendance/{aid}")
async def attendance_delete(aid: str, admin: dict = Depends(require_admin)):
    res = await db.attendance.delete_one({"_id": ObjectId(aid)})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Catatan tidak ditemukan")
    return {"ok": True}


@api_router.get("/attendance")
async def list_attendance(month: str, user: dict = Depends(get_current_user)):
    q = {"date": {"$regex": f"^{re.escape(month)}"}}
    if user.get("role") != "admin":
        q["user_id"] = user["id"]
    docs = await db.attendance.find(q).sort("date", -1).to_list(3000)
    for d in docs:
        d["id"] = str(d["_id"]); d.pop("_id", None)
    recap = {}
    for d in docs:
        e = recap.setdefault(d["user_name"], {"user_name": d["user_name"], "hadir": 0, "telat": 0,
                                              "izin": 0, "sakit": 0, "alpha": 0, "total_menit": 0})
        st = d.get("status", "Hadir")
        if st == "Hadir":
            e["hadir"] += 1
            if d.get("late"):
                e["telat"] += 1
            e["total_menit"] += d.get("work_minutes", 0)
        elif st == "Izin":
            e["izin"] += 1
        elif st == "Sakit":
            e["sakit"] += 1
        elif st == "Alpha":
            e["alpha"] += 1
    return {"month": month, "records": docs, "recap": sorted(recap.values(), key=lambda x: -x["hadir"])}

# ---------------- Rekap Gaji (payroll) ----------------
class PayrollSetting(BaseModel):
    potongan_telat: float
    hari_kerja: int = 26

class PayrollSave(BaseModel):
    user_id: str
    month: str
    gaji_pokok: float
    komisi: float
    potongan: float
    note: str = ""

@api_router.get("/payroll/settings")
async def get_payroll_settings(user: dict = Depends(get_current_user)):
    s = await db.settings.find_one({"key": "payroll"}) or {}
    return {"potongan_telat": s.get("potongan_telat", 0), "hari_kerja": s.get("hari_kerja", 26)}

@api_router.post("/payroll/settings")
async def set_payroll_settings(data: PayrollSetting, admin: dict = Depends(require_admin)):
    val = max(0.0, data.potongan_telat)
    hk = max(1, data.hari_kerja)
    await db.settings.update_one({"key": "payroll"}, {"$set": {"potongan_telat": val, "hari_kerja": hk}}, upsert=True)
    return {"ok": True, "potongan_telat": val, "hari_kerja": hk}

async def _compute_payroll(month: str):
    users = await db.users.find().sort("created_at", 1).to_list(500)
    comm = (await db.settings.find_one({"key": "commission"}) or {}).get("rate", 0)
    pay = await db.settings.find_one({"key": "payroll"}) or {}
    pot_rate = pay.get("potongan_telat", 0)
    hari_kerja = pay.get("hari_kerja", 26) or 26
    sales = await db.ecommerce_sales.find({"status": "Selesai", "created_at": {"$regex": f"^{re.escape(month)}"}}).to_list(20000)
    komisi_agg = laba_by_user(sales, users)
    att = await db.attendance.find({"date": {"$regex": f"^{re.escape(month)}"}}).to_list(5000)
    telat_by_uid = {}; hadir_by_uid = {}; alpha_by_uid = {}
    for a in att:
        st = a.get("status", "Hadir")
        if st == "Hadir":
            hadir_by_uid[a["user_id"]] = hadir_by_uid.get(a["user_id"], 0) + 1
            if a.get("late"):
                telat_by_uid[a["user_id"]] = telat_by_uid.get(a["user_id"], 0) + 1
        elif st == "Alpha":
            alpha_by_uid[a["user_id"]] = alpha_by_uid.get(a["user_id"], 0) + 1
    bases = {b["user_id"]: b.get("gaji_pokok", 0) for b in await db.employee_salary.find().to_list(500)}
    overrides = {o["user_id"]: o for o in await db.payroll.find({"month": month}).to_list(500)}
    rows = []
    for u in users:
        uid = str(u["_id"]); name = u["name"]
        telat = telat_by_uid.get(uid, 0); hadir = hadir_by_uid.get(uid, 0); alpha = alpha_by_uid.get(uid, 0)
        komisi_calc = komisi_agg.get(uid, {}).get("laba_kotor", 0) * comm / 100
        base = bases.get(uid, 0)
        potongan_alpha = round(alpha * base / hari_kerja) if hari_kerja else 0
        potongan_calc = telat * pot_rate + potongan_alpha
        ov = overrides.get(uid)
        if ov:
            gaji_pokok = ov.get("gaji_pokok", base); komisi = ov.get("komisi", komisi_calc); potongan = ov.get("potongan", potongan_calc)
            edited = True
        else:
            gaji_pokok = base; komisi = komisi_calc; potongan = potongan_calc; edited = False
        rows.append({"user_id": uid, "user_name": name, "role": u["role"], "hadir": hadir, "telat": telat, "alpha": alpha,
                     "gaji_pokok": gaji_pokok, "komisi": komisi, "potongan": potongan,
                     "total": gaji_pokok + komisi - potongan, "komisi_calc": komisi_calc,
                     "potongan_calc": potongan_calc, "potongan_alpha": potongan_alpha, "edited": edited, "note": (ov or {}).get("note", "")})
    return {"month": month, "commission_rate": comm, "potongan_telat": pot_rate, "hari_kerja": hari_kerja, "rows": rows}

@api_router.get("/payroll/report")
async def payroll_report(month: str, admin: dict = Depends(require_admin)):
    return await _compute_payroll(month)

class PayrollArchive(BaseModel):
    month: str

@api_router.post("/payroll/archive")
async def payroll_archive(data: PayrollArchive, admin: dict = Depends(require_admin)):
    rep = await _compute_payroll(data.month)
    for r in rep["rows"]:
        await db.payroll.update_one({"user_id": r["user_id"], "month": data.month},
            {"$set": {"gaji_pokok": r["gaji_pokok"], "komisi": r["komisi"], "potongan": r["potongan"],
                      "total": r["total"], "note": r.get("note", "")}}, upsert=True)
    return {"ok": True, "archived": len(rep["rows"])}

@api_router.get("/payroll/archives")
async def payroll_archives(admin: dict = Depends(require_admin)):
    pipeline = [{"$group": {"_id": "$month", "total": {"$sum": "$total"}, "count": {"$sum": 1}}}, {"$sort": {"_id": -1}}]
    docs = await db.payroll.aggregate(pipeline).to_list(200)
    return [{"month": d["_id"], "total": d["total"], "count": d["count"]} for d in docs]

@api_router.post("/payroll/save")
async def payroll_save(data: PayrollSave, admin: dict = Depends(require_admin)):
    total = data.gaji_pokok + data.komisi - data.potongan
    await db.payroll.update_one({"user_id": data.user_id, "month": data.month},
        {"$set": {"gaji_pokok": data.gaji_pokok, "komisi": data.komisi, "potongan": data.potongan, "note": data.note, "total": total}}, upsert=True)
    await db.employee_salary.update_one({"user_id": data.user_id}, {"$set": {"gaji_pokok": data.gaji_pokok}}, upsert=True)
    return {"ok": True, "total": total}

@api_router.delete("/payroll/override")
async def payroll_reset(user_id: str, month: str, admin: dict = Depends(require_admin)):
    await db.payroll.delete_one({"user_id": user_id, "month": month})
    return {"ok": True}

# ---------------- Pengajuan Izin/Sakit (leave requests) ----------------
class LeaveInput(BaseModel):
    date: str
    type: str
    reason: str = ""

class LeaveReview(BaseModel):
    approve: bool

@api_router.post("/leave")
async def create_leave(data: LeaveInput, user: dict = Depends(get_current_user)):
    if data.type not in ["Izin", "Sakit"]:
        raise HTTPException(status_code=400, detail="Jenis harus Izin atau Sakit")
    doc = {"user_id": user["id"], "user_name": user["name"], "date": data.date, "type": data.type,
           "reason": data.reason, "status": "Pending", "created_at": wib_now().isoformat(),
           "reviewed_by": None, "reviewed_at": None}
    res = await db.leave_requests.insert_one(doc)
    doc["id"] = str(res.inserted_id); doc.pop("_id", None)
    return doc

@api_router.get("/leave")
async def list_leave(month: Optional[str] = None, status: Optional[str] = None, user: dict = Depends(get_current_user)):
    q = {}
    if user.get("role") != "admin":
        q["user_id"] = user["id"]
    if month:
        q["date"] = {"$regex": f"^{re.escape(month)}"}
    if status:
        q["status"] = status
    docs = await db.leave_requests.find(q).sort("created_at", -1).to_list(2000)
    for d in docs:
        d["id"] = str(d["_id"]); d.pop("_id", None)
    pending = await db.leave_requests.count_documents({"status": "Pending"})
    return {"requests": docs, "pending_count": pending}

@api_router.put("/leave/{lid}/review")
async def review_leave(lid: str, data: LeaveReview, admin: dict = Depends(require_admin)):
    doc = await db.leave_requests.find_one({"_id": ObjectId(lid)})
    if not doc:
        raise HTTPException(status_code=404, detail="Pengajuan tidak ditemukan")
    if doc["status"] != "Pending":
        raise HTTPException(status_code=400, detail="Pengajuan sudah diproses")
    new_status = "Disetujui" if data.approve else "Ditolak"
    await db.leave_requests.update_one({"_id": ObjectId(lid)},
        {"$set": {"status": new_status, "reviewed_by": admin["name"], "reviewed_at": wib_now().isoformat()}})
    if data.approve:
        att_doc = {"user_id": doc["user_id"], "user_name": doc["user_name"], "date": doc["date"],
                   "status": doc["type"], "check_in": None, "check_out": None, "work_minutes": 0,
                   "late": False, "created_at": wib_now().isoformat()}
        await db.attendance.update_one({"user_id": doc["user_id"], "date": doc["date"]}, {"$set": att_doc}, upsert=True)
    return {"ok": True, "status": new_status}

@api_router.delete("/leave/{lid}")
async def delete_leave(lid: str, user: dict = Depends(get_current_user)):
    doc = await db.leave_requests.find_one({"_id": ObjectId(lid)})
    if not doc:
        raise HTTPException(status_code=404, detail="Pengajuan tidak ditemukan")
    if user.get("role") != "admin" and (doc["user_id"] != user["id"] or doc["status"] != "Pending"):
        raise HTTPException(status_code=403, detail="Tidak diizinkan")
    await db.leave_requests.delete_one({"_id": ObjectId(lid)})
    return {"ok": True}

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=False,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------- Seed ----------------
CATEGORIES = {
    "Pupuk": [("NPK Phonska 25kg", "karung", 135000, 155000, 80),
              ("Urea Pupuk Indonesia 50kg", "karung", 230000, 260000, 60),
              ("Pupuk Organik Petroganik 40kg", "karung", 28000, 38000, 120),
              ("KCl Mahkota 50kg", "karung", 340000, 380000, 30)],
    "Benih": [("Benih Padi Ciherang 5kg", "bungkus", 65000, 85000, 90),
              ("Benih Jagung Hibrida Bisi-18 1kg", "bungkus", 85000, 110000, 70),
              ("Benih Cabai Rawit Dewata 10gr", "sachet", 18000, 28000, 150)],
    "Pestisida": [("Gramoxone 1L", "botol", 72000, 95000, 45),
                  ("Roundup 1L", "botol", 85000, 110000, 40),
                  ("Curacron 500ml", "botol", 95000, 125000, 35)],
    "Alat Tani": [("Tangki Sprayer Elektrik 16L", "unit", 320000, 410000, 15),
                  ("Cangkul Baja Super", "unit", 55000, 78000, 25),
                  ("Sabit Bergerigi", "unit", 25000, 40000, 40)],
}

async def seed():
    # users
    for email_key, pwd_key, name_key, role in [
        ("ADMIN_EMAIL", "ADMIN_PASSWORD", "ADMIN_NAME", "admin"),
        ("KASIR_EMAIL", "KASIR_PASSWORD", None, "kasir")]:
        email = os.environ.get(email_key, "").lower()
        pwd = os.environ.get(pwd_key, "")
        name = os.environ.get(name_key, "Kasir 1") if name_key else "Kasir Toko"
        existing = await db.users.find_one({"email": email})
        if not existing:
            await db.users.insert_one({"email": email, "password_hash": hash_password(pwd),
                                       "name": name, "role": role, "created_at": now_iso()})

    if await db.products.count_documents({}) == 0:
        sku_n = 1001
        for cat, items in CATEGORIES.items():
            for name, unit, beli, jual, stok in items:
                await db.products.insert_one({"sku": f"SKU-{sku_n}", "name": name, "category": cat,
                    "unit": unit, "harga_beli": beli, "harga_jual": jual,
                    "stok": stok, "stok_minimal": 10})
                sku_n += 1

    async for p in db.products.find({"harga_reseller": {"$exists": False}}):
        await db.products.update_one({"_id": p["_id"]}, {"$set": {"harga_reseller": round(p["harga_jual"] * 0.9)}})

    if not await db.settings.find_one({"key": "channels"}):
        await db.settings.update_one({"key": "channels"}, {"$set": {"list": [dict(c) for c in DEFAULT_CHANNELS]}}, upsert=True)
    await db.ecommerce_sales.update_many({"status": {"$exists": False}}, {"$set": {"status": "Selesai"}})

    if await db.transactions.count_documents({}) == 0:
        products = await db.products.find().to_list(1000)
        cashiers = await db.users.find().to_list(10)
        inv = 1
        now = datetime.now(timezone.utc)
        # generate ~2 years of data (monthly seasonality)
        for days_ago in range(0, 730):
            day = now - timedelta(days=days_ago)
            month = day.month
            # planting seasons: more sales in Oct-Dec and Mar-May
            base = 6 if month in (10, 11, 12, 3, 4, 5) else 3
            n_tx = random.randint(max(1, base - 2), base + 3)
            for _ in range(n_tx):
                n_items = random.randint(1, 4)
                chosen = random.sample(products, min(n_items, len(products)))
                items = []
                total = 0
                for p in chosen:
                    qty = random.randint(1, 5)
                    sub = qty * p["harga_jual"]
                    total += sub
                    items.append({"product_id": str(p["_id"]), "name": p["name"],
                                  "qty": qty, "harga": p["harga_jual"], "subtotal": sub})
                ts = day.replace(hour=random.randint(8, 17), minute=random.randint(0, 59))
                c = random.choice(cashiers)
                await db.transactions.insert_one({
                    "invoice_no": f"INV-{ts.strftime('%Y%m%d')}-{inv:04d}",
                    "items": items, "total": total,
                    "payment_method": random.choice(["Tunai", "Tunai", "Transfer", "QRIS"]),
                    "cashier_id": str(c["_id"]), "cashier_name": c["name"],
                    "created_at": ts.isoformat()})
                inv += 1
        logger.info(f"Seeded {inv} transactions")

@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    try:
        init_storage()
        logger.info("Storage initialized")
    except Exception as e:
        logger.error(f"Storage init failed: {e}")
    await seed()

@app.on_event("shutdown")
async def shutdown():
    client.close()
