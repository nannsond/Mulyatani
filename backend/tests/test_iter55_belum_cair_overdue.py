"""
Iter 55 — Pengingat Dana Cair overdue tests.
- selesai_at stored on transition to Selesai
- GET /ecommerce/belum-cair returns umur_hari (admin only, kasir 403)
"""
import os
import time
from datetime import datetime, timedelta, timezone

import pytest
import requests
from pymongo import MongoClient
from bson import ObjectId
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
load_dotenv("/app/frontend/.env")

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json().get("access_token") or r.json()["token"]


@pytest.fixture(scope="module")
def admin_h():
    return {"Authorization": f"Bearer {_login('nannsond@gmail.com', 'admin123')}"}


@pytest.fixture(scope="module")
def kasir_h():
    return {"Authorization": f"Bearer {_login('kasir@tokotani.com', 'kasir123')}"}


@pytest.fixture(scope="module")
def mongo():
    c = MongoClient(MONGO_URL)
    yield c[DB_NAME]
    c.close()


@pytest.fixture(scope="module")
def product(admin_h):
    r = requests.get(f"{API}/products", headers=admin_h, timeout=30)
    assert r.status_code == 200
    prods = [p for p in r.json() if p.get("stok", 0) >= 2]
    assert prods, "need a product with stock>=2 for seeding"
    return prods[0]


def _create_sale(admin_h, product, qty=1, days_ago=0):
    date_str = (datetime.now(timezone.utc) - timedelta(days=days_ago)).strftime("%Y-%m-%d")
    payload = {
        "channel": "Shopee",
        "items": [{"product_id": product["id"], "name": product["name"], "qty": qty,
                   "harga": max(product.get("harga_channel", {}).get("Shopee") or 10000, 1000),
                   "is_bundle": False}],
        "admin_fee": 500, "ongkir": 0, "biaya_lain": 0,
        "customer_name": "TEST_overdue", "order_no": f"TEST_{int(time.time()*1000)}",
        "date": date_str,
    }
    r = requests.post(f"{API}/ecommerce/sales", json=payload, headers=admin_h, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _delete_sale(admin_h, sid):
    requests.delete(f"{API}/ecommerce/sales/{sid}", headers=admin_h, timeout=30)


# --- Tests ---

def test_kasir_forbidden_belum_cair(kasir_h):
    r = requests.get(f"{API}/ecommerce/belum-cair", headers=kasir_h, timeout=30)
    assert r.status_code == 403


def test_update_status_selesai_sets_selesai_at(admin_h, product, mongo):
    sid = _create_sale(admin_h, product)
    try:
        # Not Selesai yet -> no selesai_at
        doc = mongo.ecommerce_sales.find_one({"_id": ObjectId(sid)})
        assert "selesai_at" not in doc or not doc.get("selesai_at")

        r = requests.put(f"{API}/ecommerce/sales/{sid}/status",
                         json={"status": "Selesai"}, headers=admin_h, timeout=30)
        assert r.status_code == 200
        doc = mongo.ecommerce_sales.find_one({"_id": ObjectId(sid)})
        assert doc.get("selesai_at"), "selesai_at must be set on transition to Selesai"
        first_ts = doc["selesai_at"]

        # Transitioning Selesai->Selesai again should NOT change selesai_at (only on transition INTO)
        time.sleep(1)
        r = requests.put(f"{API}/ecommerce/sales/{sid}/status",
                         json={"status": "Selesai"}, headers=admin_h, timeout=30)
        assert r.status_code == 200
        doc = mongo.ecommerce_sales.find_one({"_id": ObjectId(sid)})
        assert doc["selesai_at"] == first_ts
    finally:
        _delete_sale(admin_h, sid)


def test_belum_cair_contains_umur_hari_and_overdue(admin_h, product, mongo):
    # Create 2 sales, both set Selesai; mutate one's selesai_at to 10 days ago
    sid_overdue = _create_sale(admin_h, product)
    sid_recent = _create_sale(admin_h, product)
    try:
        for sid in (sid_overdue, sid_recent):
            r = requests.put(f"{API}/ecommerce/sales/{sid}/status",
                             json={"status": "Selesai"}, headers=admin_h, timeout=30)
            assert r.status_code == 200

        old_iso = (datetime.now(timezone.utc) - timedelta(days=10)).isoformat()
        mongo.ecommerce_sales.update_one({"_id": ObjectId(sid_overdue)},
                                         {"$set": {"selesai_at": old_iso}})

        r = requests.get(f"{API}/ecommerce/belum-cair", headers=admin_h, timeout=30)
        assert r.status_code == 200
        rows = r.json()
        by_id = {x["id"]: x for x in rows}
        assert sid_overdue in by_id
        assert sid_recent in by_id
        assert by_id[sid_overdue]["umur_hari"] >= 10
        assert by_id[sid_recent]["umur_hari"] <= 1
        # No _id leaked
        for x in rows:
            assert "_id" not in x
    finally:
        _delete_sale(admin_h, sid_overdue)
        _delete_sale(admin_h, sid_recent)


def test_recording_cair_removes_from_belum_cair(admin_h, product, mongo):
    sid = _create_sale(admin_h, product)
    try:
        requests.put(f"{API}/ecommerce/sales/{sid}/status",
                     json={"status": "Selesai"}, headers=admin_h, timeout=30)
        old_iso = (datetime.now(timezone.utc) - timedelta(days=10)).isoformat()
        mongo.ecommerce_sales.update_one({"_id": ObjectId(sid)},
                                         {"$set": {"selesai_at": old_iso}})
        # record cair
        r = requests.put(f"{API}/ecommerce/sales/{sid}/cair",
                         json={"nominal": 1000, "tanggal": datetime.now(timezone.utc).strftime("%Y-%m-%d")},
                         headers=admin_h, timeout=30)
        assert r.status_code == 200, r.text
        r = requests.get(f"{API}/ecommerce/belum-cair", headers=admin_h, timeout=30)
        assert r.status_code == 200
        assert sid not in {x["id"] for x in r.json()}
    finally:
        _delete_sale(admin_h, sid)
