"""Iter 43: Hutang pay-date routing + Cash flow chart data.

Covers:
- POST /purchases with amount_paid<total: pembelian on purchase date = initial paid only
- POST /purchases/{id}/pay with date: pembelian moves to pay date,
  info 'Bayar hutang supplier (pembelian <saledate>)'
- amount<=0 => 400; overpayment capped; no double counting across months
- /api/reports/cash/daily rows carry saldo_berjalan & keluar for chart
"""
import os
import uuid
import requests
import pytest
from pymongo import MongoClient
from bson import ObjectId
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
BASE = open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split("\n")[0].strip().strip('"').rstrip("/")
MONGO = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]

ADMIN = {"email": "nannsond@gmail.com", "password": "admin123"}

PO_DATE = "2097-05-05"
PAY_DATE = "2097-06-10"
PO_MONTH = "2097-05"
PAY_MONTH = "2097-06"
MARK = "TEST_ITER43"


def _login(creds):
    r = requests.post(f"{BASE}/api/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_h():
    return {"Authorization": f"Bearer {_login(ADMIN)}"}


@pytest.fixture(scope="module")
def product(admin_h):
    sku = f"{MARK}-{uuid.uuid4().hex[:6]}"
    p = requests.post(f"{BASE}/api/products", headers=admin_h, json={
        "sku": sku, "name": f"{MARK}_Prod", "category": "Umum",
        "unit": "pcs", "harga_beli": 1000, "harga_jual": 10000, "stok": 0}, timeout=20)
    assert p.status_code in (200, 201), p.text
    doc = p.json()
    pid = doc.get("id") or doc.get("_id")
    doc["id"] = pid
    yield doc
    try:
        requests.delete(f"{BASE}/api/products/{pid}", headers=admin_h, timeout=20)
    except Exception:
        pass
    MONGO.products.delete_many({"sku": sku})


_po_ids = []


def _mk_purchase(admin_h, product, qty, harga, amount_paid, backdate=PO_DATE):
    body = {
        "supplier": f"{MARK}_supp",
        "items": [{"product_id": product["id"], "name": product["name"],
                   "qty": qty, "harga_beli": harga}],
        "amount_paid": amount_paid,
        "note": MARK,
    }
    r = requests.post(f"{BASE}/api/purchases", headers=admin_h, json=body, timeout=20)
    assert r.status_code in (200, 201), r.text
    doc = r.json()
    pid = doc["id"]
    _po_ids.append(pid)
    MONGO.purchases.update_one(
        {"_id": ObjectId(pid)},
        {"$set": {"created_at": f"{backdate}T08:00:00+00:00"}}
    )
    return pid, doc


def test_purchase_initial_only_on_po_date(admin_h, product):
    # total 100k, paid 30k initial
    _mk_purchase(admin_h, product, 10, 10000, 30000)
    r = requests.get(f"{BASE}/api/reports/cash/day", headers=admin_h,
                     params={"date": PO_DATE}, timeout=20)
    assert r.status_code == 200, r.text
    items = r.json().get("items", [])
    ours = [i for i in items if i.get("kind") == "pembelian" and i.get("desc") == f"{MARK}_supp"]
    assert ours, items
    initial_rows = [i for i in ours if "Bayar awal" in (i.get("info") or "") and i["amount"] == 30000]
    assert initial_rows, ours


def test_pay_purchase_with_date_moves_to_pay_month(admin_h, product):
    pid, _ = _mk_purchase(admin_h, product, 10, 10000, 30000)
    r = requests.post(f"{BASE}/api/purchases/{pid}/pay", headers=admin_h,
                      json={"amount": 50000, "date": PAY_DATE}, timeout=20)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["amount_paid"] == 80000
    assert j["status"] == "sebagian"

    rp = requests.get(f"{BASE}/api/reports/cash/day", headers=admin_h,
                      params={"date": PAY_DATE}, timeout=20).json()
    hits = [i for i in rp.get("items", [])
            if i.get("kind") == "pembelian"
            and "Bayar hutang supplier" in (i.get("info") or "")
            and PO_DATE in (i.get("info") or "")
            and i["amount"] == 50000
            and i.get("desc") == f"{MARK}_supp"]
    assert hits, f"No pelunasan hutang row in {PAY_DATE} detail: {rp}"

    rd = requests.get(f"{BASE}/api/reports/cash/daily", headers=admin_h,
                     params={"period": PO_MONTH}, timeout=20).json()
    rows = rd.get("rows", [])
    dates = [row["date"] for row in rows]
    assert PAY_DATE not in dates

    rd2 = requests.get(f"{BASE}/api/reports/cash/daily", headers=admin_h,
                      params={"period": PAY_MONTH}, timeout=20).json()
    rows2 = rd2.get("rows", [])
    row = next((x for x in rows2 if x["date"] == PAY_DATE), None)
    assert row and row.get("pembelian", 0) >= 50000, rows2
    # chart data essentials
    assert "saldo_berjalan" in row
    assert row.get("keluar", 0) >= 50000


def test_invalid_amount_rejected_and_overpay_capped(admin_h, product):
    pid, _ = _mk_purchase(admin_h, product, 1, 10000, 0)  # total 10k
    r = requests.post(f"{BASE}/api/purchases/{pid}/pay", headers=admin_h,
                     json={"amount": 0, "date": PAY_DATE}, timeout=20)
    assert r.status_code == 400
    r = requests.post(f"{BASE}/api/purchases/{pid}/pay", headers=admin_h,
                     json={"amount": -3, "date": PAY_DATE}, timeout=20)
    assert r.status_code == 400

    r = requests.post(f"{BASE}/api/purchases/{pid}/pay", headers=admin_h,
                     json={"amount": 99999, "date": PAY_DATE}, timeout=20)
    assert r.status_code == 200
    j = r.json()
    assert j["amount_paid"] == 10000
    assert j["status"] == "lunas"


def test_total_kas_no_period_no_double_count(admin_h):
    rs = requests.get(f"{BASE}/api/reports/cash", headers=admin_h,
                      params={"period": PO_MONTH}, timeout=20).json()
    rp = requests.get(f"{BASE}/api/reports/cash", headers=admin_h,
                      params={"period": PAY_MONTH}, timeout=20).json()
    j = requests.get(f"{BASE}/api/reports/cash", headers=admin_h, timeout=20).json()
    # Our contributions: PO_MONTH 30+30+0 = 60k; PAY_MONTH 50+10 = 60k
    assert rs.get("pembelian", 0) >= 60000
    assert rp.get("pembelian", 0) >= 60000
    assert j.get("pembelian", 0) >= rs["pembelian"] + rp["pembelian"] - 1


def test_hutang_listing_contains_sebagian(admin_h, product):
    pid, _ = _mk_purchase(admin_h, product, 2, 10000, 5000)
    r = requests.get(f"{BASE}/api/hutang", headers=admin_h, timeout=20)
    assert r.status_code == 200
    found = [h for h in r.json() if h["id"] == pid]
    assert found
    assert found[0]["sisa"] == 15000


def teardown_module(module):
    for pid in _po_ids:
        try:
            MONGO.purchases.delete_one({"_id": ObjectId(pid)})
        except Exception:
            pass
    MONGO.products.delete_many({"sku": {"$regex": f"^{MARK}"}})
