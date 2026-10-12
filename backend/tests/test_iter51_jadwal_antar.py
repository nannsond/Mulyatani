"""Iter 51: jadwal_antar and carry-over for Pengantaran."""
import os
import re
import pytest
import requests
from datetime import datetime, timezone, timedelta
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
import asyncio

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "nannsond@gmail.com", "password": "admin123"}
KASIR = {"email": "kasir@tokotani.com", "password": "kasir123"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN)


@pytest.fixture(scope="module")
def kasir_token():
    return _login(KASIR)


@pytest.fixture(scope="module")
def admin_h(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def kasir_h(kasir_token):
    return {"Authorization": f"Bearer {kasir_token}"}


@pytest.fixture(scope="module")
def sample_product(admin_h):
    r = requests.get(f"{API}/products", headers=admin_h, timeout=30)
    assert r.status_code == 200
    products = [p for p in r.json() if (p.get("stok") or 0) > 10]
    assert products, "need product with stock"
    return products[0]


_created_ids = []


@pytest.fixture(scope="module", autouse=True)
def cleanup(admin_h):
    yield
    for tid in _created_ids:
        try:
            requests.delete(f"{API}/transactions/{tid}", headers=admin_h, timeout=15)
        except Exception:
            pass


def _mk_tx(admin_h, prod, *, alamat="TEST Jl Mawar", ongkir=5000, jadwal_antar=None):
    payload = {
        "items": [{"product_id": prod["id"], "qty": 1, "name": prod.get("name", "x"), "harga": prod.get("harga_jual", 1000)}],
        "discount": 0, "ongkir": ongkir,
        "payment_method": "tunai",
        "customer_name": "TEST_Buyer", "telepon": "", "alamat": alamat,
        "amount_paid": None,
    }
    if jadwal_antar is not None:
        payload["jadwal_antar"] = jadwal_antar
    r = requests.post(f"{API}/transactions", json=payload, headers=admin_h, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    _created_ids.append(d["id"])
    return d


# ---------------- create_transaction ----------------
def test_create_tx_with_jadwal_antar(admin_h, sample_product):
    today = datetime.now().date().isoformat()
    d = _mk_tx(admin_h, sample_product, jadwal_antar=today)
    assert d["jadwal_antar"] == today
    assert d["status_antar"] == "belum"


def test_create_tx_no_delivery_no_jadwal(admin_h, sample_product):
    # no alamat and ongkir=0 -> jadwal_antar should NOT persist
    d = _mk_tx(admin_h, sample_product, alamat="", ongkir=0, jadwal_antar="2030-01-01")
    assert d["jadwal_antar"] == ""
    assert d["status_antar"] == ""


def test_create_tx_no_jadwal_field_ok(admin_h, sample_product):
    d = _mk_tx(admin_h, sample_product)  # no jadwal
    assert d["jadwal_antar"] == ""
    assert d["status_antar"] == "belum"


# ---------------- update_transaction ----------------
def test_update_tx_preserves_jadwal_when_omitted(admin_h, sample_product):
    d = _mk_tx(admin_h, sample_product, jadwal_antar="2030-06-15")
    tid = d["id"]
    payload = {
        "items": [{"product_id": sample_product["id"], "qty": 2, "name": sample_product.get("name","x"), "harga": sample_product.get("harga_jual",1000)}],
        "discount": 0, "ongkir": 5000, "payment_method": "tunai",
        "customer_name": "TEST_Buyer", "telepon": "", "alamat": "TEST Jl Mawar",
        "amount_paid": None,
        # jadwal_antar omitted
    }
    r = requests.put(f"{API}/transactions/{tid}", json=payload, headers=admin_h, timeout=30)
    assert r.status_code == 200, r.text
    assert r.json()["jadwal_antar"] == "2030-06-15"


def test_update_tx_updates_jadwal_when_provided(admin_h, sample_product):
    d = _mk_tx(admin_h, sample_product, jadwal_antar="2030-06-15")
    tid = d["id"]
    payload = {
        "items": [{"product_id": sample_product["id"], "qty": 1, "name": sample_product.get("name","x"), "harga": sample_product.get("harga_jual",1000)}],
        "discount": 0, "ongkir": 5000, "payment_method": "tunai",
        "customer_name": "TEST_Buyer", "telepon": "", "alamat": "TEST Jl Mawar",
        "amount_paid": None,
        "jadwal_antar": "2030-07-20",
    }
    r = requests.put(f"{API}/transactions/{tid}", json=payload, headers=admin_h, timeout=30)
    assert r.status_code == 200
    assert r.json()["jadwal_antar"] == "2030-07-20"


# ---------------- schedule endpoint ----------------
def test_schedule_set_and_clear(kasir_h, admin_h, sample_product):
    d = _mk_tx(admin_h, sample_product)
    tid = d["id"]
    r = requests.put(f"{API}/deliveries/{tid}/schedule", json={"jadwal_antar": "2030-08-10"}, headers=kasir_h, timeout=30)
    assert r.status_code == 200, r.text
    assert r.json()["jadwal_antar"] == "2030-08-10"
    r2 = requests.put(f"{API}/deliveries/{tid}/schedule", json={"jadwal_antar": ""}, headers=kasir_h, timeout=30)
    assert r2.status_code == 200
    assert r2.json()["jadwal_antar"] == ""


def test_schedule_invalid_format(kasir_h, admin_h, sample_product):
    d = _mk_tx(admin_h, sample_product)
    r = requests.put(f"{API}/deliveries/{d['id']}/schedule", json={"jadwal_antar": "not-a-date"}, headers=kasir_h, timeout=30)
    assert r.status_code == 400


def test_schedule_invalid_id(kasir_h):
    # non-ObjectId
    r = requests.put(f"{API}/deliveries/zzznotvalid/schedule", json={"jadwal_antar": ""}, headers=kasir_h, timeout=30)
    assert r.status_code == 404
    # valid ObjectId but not existing
    fake = "507f1f77bcf86cd799439011"
    r2 = requests.put(f"{API}/deliveries/{fake}/schedule", json={"jadwal_antar": ""}, headers=kasir_h, timeout=30)
    assert r2.status_code == 404


# ---------------- list_deliveries carry-over ----------------
async def _set_created_at(tid, iso):
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    await db.transactions.update_one({"_id": ObjectId(tid)}, {"$set": {"created_at": iso}})
    client.close()


def test_deliveries_carry_over(admin_h, sample_product):
    # Create tx and backdate created_at to previous month
    d = _mk_tx(admin_h, sample_product, jadwal_antar="")
    tid = d["id"]
    now = datetime.now(timezone.utc)
    # previous month
    prev = (now.replace(day=1) - timedelta(days=1))
    prev_iso = prev.replace(hour=10, minute=0, second=0, microsecond=0).isoformat()
    asyncio.get_event_loop().run_until_complete(_set_created_at(tid, prev_iso))

    # Query current month -> should include this unfinished carry-over
    y, m = now.year, now.month
    r = requests.get(f"{API}/deliveries?year={y}&month={m}", headers=admin_h, timeout=30)
    assert r.status_code == 200
    rows = r.json()
    match = next((x for x in rows if x["id"] == tid), None)
    assert match is not None, "carry-over unfinished tx should appear in current month"
    assert match.get("dari_bulan_lalu") is True

    # Mark selesai, requery -> should NOT be in current month (finished in earlier month)
    requests.put(f"{API}/deliveries/{tid}/status", json={"status_antar": "selesai"}, headers=admin_h, timeout=30)
    r2 = requests.get(f"{API}/deliveries?year={y}&month={m}", headers=admin_h, timeout=30)
    assert r2.status_code == 200
    assert not any(x["id"] == tid for x in r2.json()), "finished earlier-month tx should NOT appear"

    # Archived view: should not show carry-over (not archived)
    r3 = requests.get(f"{API}/deliveries?year={y}&month={m}&archived=true", headers=admin_h, timeout=30)
    assert r3.status_code == 200
    assert not any(x["id"] == tid for x in r3.json())


def test_deliveries_jadwal_in_month(admin_h, sample_product):
    # Create tx with jadwal_antar in future month; query that future month -> should appear
    now = datetime.now(timezone.utc)
    # pick a month 2 months ahead to avoid overlap with created_at
    year = now.year + (1 if now.month >= 11 else 0)
    month = ((now.month + 1) % 12) + 1
    jadwal = f"{year:04d}-{month:02d}-15"
    d = _mk_tx(admin_h, sample_product, jadwal_antar=jadwal)
    r = requests.get(f"{API}/deliveries?year={year}&month={month}", headers=admin_h, timeout=30)
    assert r.status_code == 200
    rows = r.json()
    assert any(x["id"] == d["id"] for x in rows)
