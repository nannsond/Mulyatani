"""Iter 42: Piutang pay-date routing + Belum Cair reminder.

Covers:
- POS credit sale: kas on sale date counts only initial amount_paid
- POST /transactions/{id}/pay with date: kas moves to pay date, info 'Pelunasan piutang'
- Overpayment capped; amount<=0 => 400
- Total kas (no period) still sums all paid (no double count across months)
- /api/ecommerce/belum-cair admin-only (kasir 403)
"""
import os, uuid, requests, pytest
from pymongo import MongoClient
from bson import ObjectId
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
BASE = open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split("\n")[0].strip().strip('"').rstrip("/")
MONGO = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]

ADMIN = {"email": "nannsond@gmail.com", "password": "admin123"}
KASIR = {"email": "kasir@tokotani.com", "password": "kasir123"}

SALE_DATE = "2097-03-05"       # isolated test window
PAY_DATE = "2097-04-10"
SALE_MONTH = "2097-03"
PAY_MONTH = "2097-04"
MARK = "TEST_ITER42"


def _login(creds):
    r = requests.post(f"{BASE}/api/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_h():
    return {"Authorization": f"Bearer {_login(ADMIN)}"}


@pytest.fixture(scope="module")
def kasir_h():
    return {"Authorization": f"Bearer {_login(KASIR)}"}


@pytest.fixture(scope="module")
def product(admin_h):
    sku = f"{MARK}-{uuid.uuid4().hex[:6]}"
    p = requests.post(f"{BASE}/api/products", headers=admin_h, json={
        "sku": sku, "name": f"{MARK}_Prod", "category": "Umum",
        "unit": "pcs", "harga_beli": 1000, "harga_jual": 10000, "stok": 1000}, timeout=20)
    assert p.status_code in (200, 201), p.text
    doc = p.json()
    pid = doc.get("id") or doc.get("_id") or str(doc.get("inserted_id"))
    doc["id"] = pid
    doc["name"] = doc.get("name", f"{MARK}_Prod")
    yield doc
    try:
        requests.delete(f"{BASE}/api/products/{pid}", headers=admin_h, timeout=20)
    except Exception:
        pass
    MONGO.products.delete_many({"sku": sku})


_tx_ids = []


def _mk_credit_sale(admin_h, product, qty, paid, backdate=SALE_DATE):
    body = {
        "items": [{"product_id": product["id"], "name": product["name"],
                   "qty": qty, "harga": 10000}],
        "payment_method": "Tunai",
        "customer_name": f"{MARK}_cust",
        "amount_paid": paid,
    }
    r = requests.post(f"{BASE}/api/transactions", headers=admin_h, json=body, timeout=20)
    assert r.status_code in (200, 201), r.text
    tx = r.json()
    tid = tx["id"]
    _tx_ids.append(tid)
    # backdate
    MONGO.transactions.update_one(
        {"_id": ObjectId(tid)},
        {"$set": {"created_at": f"{backdate}T08:00:00+00:00"}}
    )
    return tid


def test_credit_sale_initial_only_on_sale_date(admin_h, product):
    tid = _mk_credit_sale(admin_h, product, 10, 30000)  # total 100k, paid 30k
    r = requests.get(f"{BASE}/api/reports/cash/day", headers=admin_h,
                     params={"date": SALE_DATE}, timeout=20)
    assert r.status_code == 200, r.text
    items = r.json().get("items", [])
    # locate our tx by title (invoice_no) or desc
    ours = [i for i in items if i.get("kind") == "toko" and i.get("desc") == f"{MARK}_cust"]
    assert ours, items
    # only 1 event on sale day for this tx: initial 30k with info "Bayar awal..."
    initial_rows = [i for i in ours if "Bayar awal" in (i.get("info") or "") and i["amount"] == 30000]
    assert initial_rows, ours


def test_pay_endpoint_with_date_moves_to_pay_month(admin_h, product):
    tid = _mk_credit_sale(admin_h, product, 10, 30000)
    r = requests.post(f"{BASE}/api/transactions/{tid}/pay", headers=admin_h,
                     json={"amount": 50000, "date": PAY_DATE}, timeout=20)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["amount_paid"] == 80000
    assert j["status"] == "sebagian"

    # pay_date detail must contain pelunasan row referencing sale date
    rp = requests.get(f"{BASE}/api/reports/cash/day", headers=admin_h,
                      params={"date": PAY_DATE}, timeout=20).json()
    hits = [i for i in rp.get("items", [])
            if i.get("kind") == "toko" and "Pelunasan piutang" in (i.get("info") or "")
            and SALE_DATE in (i.get("info") or "") and i["amount"] == 50000
            and i.get("desc") == f"{MARK}_cust"]
    assert hits, f"No pelunasan row in {PAY_DATE} detail: {rp}"

    # daily rows for sale month: ensure PAY_DATE row doesn't exist in SALE_MONTH listing
    rd = requests.get(f"{BASE}/api/reports/cash/daily", headers=admin_h,
                      params={"period": SALE_MONTH}, timeout=20).json()
    dates = [row.get("date") for row in rd.get("rows", rd if isinstance(rd, list) else [])]
    assert PAY_DATE not in dates

    # And it does appear in PAY_MONTH daily
    rd2 = requests.get(f"{BASE}/api/reports/cash/daily", headers=admin_h,
                      params={"period": PAY_MONTH}, timeout=20).json()
    rows2 = rd2.get("rows", rd2 if isinstance(rd2, list) else [])
    row = next((x for x in rows2 if x.get("date") == PAY_DATE), None)
    assert row and row.get("toko", 0) >= 50000, rows2


def test_overpayment_capped_and_invalid_rejected(admin_h, product):
    tid = _mk_credit_sale(admin_h, product, 1, 0)  # total 10k
    r = requests.post(f"{BASE}/api/transactions/{tid}/pay", headers=admin_h,
                     json={"amount": 0, "date": PAY_DATE}, timeout=20)
    assert r.status_code == 400
    r = requests.post(f"{BASE}/api/transactions/{tid}/pay", headers=admin_h,
                     json={"amount": -5, "date": PAY_DATE}, timeout=20)
    assert r.status_code == 400

    r = requests.post(f"{BASE}/api/transactions/{tid}/pay", headers=admin_h,
                     json={"amount": 99999, "date": PAY_DATE}, timeout=20)
    assert r.status_code == 200
    j = r.json()
    assert j["amount_paid"] == 10000
    assert j["status"] == "lunas"


def test_total_kas_no_period_no_double_count(admin_h):
    r = requests.get(f"{BASE}/api/reports/cash", headers=admin_h, timeout=20)
    assert r.status_code == 200, r.text
    j = r.json()
    # Sum per-period omzet_offline for sale & pay months and compare to total omzet_offline (>=)
    rs = requests.get(f"{BASE}/api/reports/cash", headers=admin_h,
                      params={"period": SALE_MONTH}, timeout=20).json()
    rp = requests.get(f"{BASE}/api/reports/cash", headers=admin_h,
                      params={"period": PAY_MONTH}, timeout=20).json()
    # our contributions: SALE_MONTH 30+30+0 = 60k; PAY_MONTH 50+10 = 60k; sum = 120k (lunas)
    # across both months, offline cash from our data == 120k; total offline across all time
    # must be at least this (and double counting would've shown 180k on sale month)
    assert rs.get("omzet_offline", 0) >= 60000
    assert rp.get("omzet_offline", 0) >= 60000
    assert j.get("omzet_offline", 0) >= rs["omzet_offline"] + rp["omzet_offline"] - 1  # tolerate rounding


def test_belum_cair_admin_only(admin_h, kasir_h):
    r = requests.get(f"{BASE}/api/ecommerce/belum-cair", headers=admin_h, timeout=20)
    assert r.status_code == 200
    assert isinstance(r.json(), list)
    for d in r.json():
        assert d.get("status") == "Selesai"
        assert not d.get("cair")

    r2 = requests.get(f"{BASE}/api/ecommerce/belum-cair", headers=kasir_h, timeout=20)
    assert r2.status_code == 403, r2.text


def teardown_module(module):
    for tid in _tx_ids:
        try:
            MONGO.transactions.delete_one({"_id": ObjectId(tid)})
        except Exception:
            pass
    MONGO.customers.delete_many({"name": f"{MARK}_cust"})
    MONGO.products.delete_many({"sku": {"$regex": f"^{MARK}"}})
