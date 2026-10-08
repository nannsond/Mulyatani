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

def compute_profit(txs: List[dict], cost: dict) -> float:
    laba = 0.0
    for t in txs:
        for i in t["items"]:
            laba += i["qty"] * (i["harga"] - cost.get(i["product_id"], 0))
    return laba

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
    stok: int = 0
    stok_minimal: int = 5

class ProductInput(BaseModel):
    sku: str
    name: str
    category: str
    unit: str = "pcs"
    harga_beli: float = 0
    harga_jual: float = 0
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
    doc = {"email": email, "password_hash": hash_password(data.password),
           "name": data.name, "role": data.role, "created_at": now_iso()}
    res = await db.users.insert_one(doc)
    uid = str(res.inserted_id)
    token = create_access_token(uid, email, data.role)
    return {"token": token, "user": {"id": uid, "email": email, "name": data.name, "role": data.role}}

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
    docs = await db.products.find().sort("name", 1).to_list(1000)
    return [Product(**d).model_dump() for d in docs]

@api_router.post("/products")
async def create_product(data: ProductInput, user: dict = Depends(get_current_user)):
    if await db.products.find_one({"sku": data.sku}):
        raise HTTPException(status_code=400, detail="SKU sudah digunakan")
    doc = data.model_dump()
    res = await db.products.insert_one(doc)
    doc["_id"] = res.inserted_id
    return Product(**doc).model_dump()

@api_router.put("/products/{pid}")
async def update_product(pid: str, data: ProductInput, user: dict = Depends(get_current_user)):
    await db.products.update_one({"_id": ObjectId(pid)}, {"$set": data.model_dump()})
    doc = await db.products.find_one({"_id": ObjectId(pid)})
    if not doc:
        raise HTTPException(status_code=404, detail="Produk tidak ditemukan")
    return Product(**doc).model_dump()

@api_router.delete("/products/{pid}")
async def delete_product(pid: str, user: dict = Depends(get_current_user)):
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
    total = 0.0
    for it in data.items:
        subtotal = it.qty * it.harga
        total += subtotal
        items.append({"product_id": it.product_id, "name": it.name, "qty": it.qty,
                      "harga": it.harga, "subtotal": subtotal})
        await db.products.update_one({"_id": ObjectId(it.product_id)}, {"$inc": {"stok": -it.qty}})
    doc = {"invoice_no": await gen_invoice(), "items": items, "total": total,
           "payment_method": data.payment_method, "cashier_id": user["id"],
           "cashier_name": user["name"], "created_at": now_iso()}
    res = await db.transactions.insert_one(doc)
    doc["id"] = str(res.inserted_id)
    doc.pop("_id", None)
    return doc

@api_router.get("/transactions")
async def list_transactions(date: Optional[str] = None, q: Optional[str] = None, limit: int = 50, user: dict = Depends(get_current_user)):
    query = {}
    if date:
        query["created_at"] = {"$regex": f"^{date}"}
    if q:
        query["invoice_no"] = {"$regex": q, "$options": "i"}
    docs = await db.transactions.find(query).sort("created_at", -1).to_list(min(limit, 500))
    for d in docs:
        d["id"] = str(d["_id"])
        d.pop("_id", None)
    return docs

# ---------------- Reports ----------------
def summarize(txs: List[dict]) -> dict:
    total = sum(t["total"] for t in txs)
    count = len(txs)
    qty = sum(i["qty"] for t in txs for i in t["items"])
    pay = {}
    for t in txs:
        pay[t["payment_method"]] = pay.get(t["payment_method"], 0) + t["total"]
    return {"total_omzet": total, "jumlah_transaksi": count, "total_item": qty,
            "rata_rata": total / count if count else 0, "pembayaran": pay}

async def top_products(txs: List[dict], limit: int = 5):
    agg = {}
    for t in txs:
        for i in t["items"]:
            e = agg.setdefault(i["name"], {"name": i["name"], "qty": 0, "omzet": 0})
            e["qty"] += i["qty"]
            e["omzet"] += i["subtotal"]
    return sorted(agg.values(), key=lambda x: x["omzet"], reverse=True)[:limit]

async def category_breakdown(txs: List[dict]):
    prods = {str(p["_id"]): p for p in await db.products.find().to_list(1000)}
    agg = {}
    for t in txs:
        for i in t["items"]:
            cat = prods.get(i["product_id"], {}).get("category", "Lainnya")
            agg[cat] = agg.get(cat, 0) + i["subtotal"]
    return [{"category": k, "omzet": v} for k, v in sorted(agg.items(), key=lambda x: -x[1])]

async def product_profit(txs: List[dict], cost: dict, limit: int = 5):
    agg = {}
    for t in txs:
        for i in t["items"]:
            hb = cost.get(i["product_id"], 0)
            e = agg.setdefault(i["name"], {"name": i["name"], "qty": 0, "omzet": 0, "laba": 0})
            e["qty"] += i["qty"]; e["omzet"] += i["subtotal"]
            e["laba"] += i["qty"] * (i["harga"] - hb)
    arr = sorted(agg.values(), key=lambda x: x["laba"], reverse=True)
    terendah = list(reversed(arr[-limit:])) if len(arr) > limit else list(reversed(arr))
    return {"tertinggi": arr[:limit], "terendah": terendah}

@api_router.get("/reports/daily")
async def report_daily(date: str, user: dict = Depends(get_current_user)):
    txs = await db.transactions.find({"created_at": {"$regex": f"^{date}"}}).sort("created_at", 1).to_list(2000)
    for t in txs:
        t["id"] = str(t["_id"]); t.pop("_id", None)
    cost = await product_cost_map()
    s = summarize(txs); s["total_laba"] = compute_profit(txs, cost)
    return {"date": date, "summary": s, "transactions": txs,
            "top_products": await top_products(txs), "categories": await category_breakdown(txs)}

@api_router.get("/reports/monthly")
async def report_monthly(year: int, month: int, user: dict = Depends(get_current_user)):
    prefix = f"{year}-{month:02d}"
    txs = await db.transactions.find({"created_at": {"$regex": f"^{prefix}"}}).to_list(5000)
    cost = await product_cost_map()
    daily = {}
    for t in txs:
        day = t["created_at"][:10]
        d = daily.setdefault(day, {"date": day, "omzet": 0, "transaksi": 0, "laba": 0})
        d["omzet"] += t["total"]; d["transaksi"] += 1
        d["laba"] += compute_profit([t], cost)
    s = summarize(txs); s["total_laba"] = compute_profit(txs, cost)
    target = await db.targets.find_one({"year": year, "month": month})
    return {"year": year, "month": month, "summary": s,
            "target_omzet": target["target_omzet"] if target else 0,
            "daily": sorted(daily.values(), key=lambda x: x["date"]),
            "product_laba": await product_profit(txs, cost),
            "top_products": await top_products(txs), "categories": await category_breakdown(txs)}

@api_router.get("/reports/yearly")
async def report_yearly(year: int, user: dict = Depends(get_current_user)):
    txs = await db.transactions.find({"created_at": {"$regex": f"^{year}"}}).to_list(20000)
    cost = await product_cost_map()
    monthly = {m: {"month": m, "omzet": 0, "transaksi": 0, "laba": 0} for m in range(1, 13)}
    for t in txs:
        m = int(t["created_at"][5:7])
        monthly[m]["omzet"] += t["total"]; monthly[m]["transaksi"] += 1
        monthly[m]["laba"] += compute_profit([t], cost)
    s = summarize(txs); s["total_laba"] = compute_profit(txs, cost)
    target = await db.targets.find_one({"year": year, "month": 0})
    return {"year": year, "summary": s,
            "target_omzet": target["target_omzet"] if target else 0,
            "monthly": list(monthly.values()),
            "product_laba": await product_profit(txs, cost),
            "top_products": await top_products(txs, 8), "categories": await category_breakdown(txs)}

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
@api_router.get("/settings")
async def get_settings(user: dict = Depends(get_current_user)):
    s = await db.settings.find_one({"key": "store"})
    return {"has_logo": bool(s and s.get("logo_path")),
            "logo_updated": s.get("updated_at") if s else None}

@api_router.post("/settings/logo")
async def upload_logo(file: UploadFile = File(...), admin: dict = Depends(require_admin)):
    ext = file.filename.split(".")[-1].lower() if "." in file.filename else "png"
    if ext not in ("png", "jpg", "jpeg", "webp"):
        raise HTTPException(status_code=400, detail="Format harus PNG/JPG/WEBP")
    data = await file.read()
    if len(data) > 2 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Ukuran maksimal 2MB")
    path = f"{APP_NAME}/logo/{uuid.uuid4()}.{ext}"
    put_object(path, data, file.content_type or "image/png")
    await db.settings.update_one({"key": "store"},
        {"$set": {"logo_path": path, "content_type": file.content_type or "image/png", "updated_at": now_iso()}}, upsert=True)
    return {"ok": True, "updated_at": now_iso()}

@api_router.get("/settings/logo")
async def get_logo():
    s = await db.settings.find_one({"key": "store"})
    if not s or not s.get("logo_path"):
        raise HTTPException(status_code=404, detail="Logo belum diset")
    data, ct = get_object(s["logo_path"])
    return Response(content=data, media_type=s.get("content_type", ct))

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

# ---------------- Dashboard ----------------
@api_router.get("/dashboard")
async def dashboard(user: dict = Depends(get_current_user)):
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    today_txs = await db.transactions.find({"created_at": {"$regex": f"^{today}"}}).to_list(2000)
    products = await db.products.find().to_list(1000)
    low_stock = [Product(**p).model_dump() for p in products if p["stok"] <= p["stok_minimal"]]
    # last 7 days
    series = []
    for i in range(6, -1, -1):
        day = (datetime.now(timezone.utc) - timedelta(days=i)).strftime("%Y-%m-%d")
        dtx = await db.transactions.find({"created_at": {"$regex": f"^{day}"}}).to_list(2000)
        series.append({"date": day, "omzet": sum(t["total"] for t in dtx), "transaksi": len(dtx)})
    return {"today": summarize(today_txs), "low_stock": low_stock,
            "total_produk": len(products), "series7": series,
            "top_products": await top_products(today_txs)}

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
        elif not verify_password(pwd, existing["password_hash"]):
            await db.users.update_one({"email": email}, {"$set": {"password_hash": hash_password(pwd)}})

    if await db.products.count_documents({}) == 0:
        sku_n = 1001
        for cat, items in CATEGORIES.items():
            for name, unit, beli, jual, stok in items:
                await db.products.insert_one({"sku": f"SKU-{sku_n}", "name": name, "category": cat,
                    "unit": unit, "harga_beli": beli, "harga_jual": jual,
                    "stok": stok, "stok_minimal": 10})
                sku_n += 1

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
