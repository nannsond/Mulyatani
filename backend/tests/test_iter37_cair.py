"""Iteration 37: Dana Cair tracking + category filter (backend tests)."""
import os
import uuid
import pytest
import requests
from datetime import datetime

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Try reading frontend .env
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL"):
                BASE_URL = line.strip().split("=", 1)[1].strip().rstrip("/")

ADMIN = {"email": "nannsond@gmail.com", "password": "admin123"}
KASIR = {"email": "kasir@tokotani.com", "password": "kasir123"}


def _token(creds):
    r = requests.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_h():
    return {"Authorization": f"Bearer {_token(ADMIN)}"}


@pytest.fixture(scope="module")
def kasir_h():
    return {"Authorization": f"Bearer {_token(KASIR)}"}


@pytest.fixture(scope="module")
def test_sale(admin_h):
    # Create a TEST product
    pname = f"TEST_CAIR_{uuid.uuid4().hex[:6]}"
    pr = requests.post(f"{BASE_URL}/api/products", json={
        "sku": f"SKU-{uuid.uuid4().hex[:6]}", "name": pname, "nama": pname,
        "category": "TEST", "kategori": "TEST", "harga_jual": 50000,
        "harga_pokok": 20000, "stok": 10, "satuan": "pcs"
    }, headers=admin_h, timeout=15)
    assert pr.status_code in (200, 201), pr.text
    pid = pr.json()["id"]

    sr = requests.post(f"{BASE_URL}/api/ecommerce/sales", json={
        "channel": "TikTok Shop",
        "order_no": f"TEST-{uuid.uuid4().hex[:6]}",
        "customer_name": "TEST Buyer",
        "items": [{"product_id": pid, "name": pname, "qty": 1, "harga": 50000, "harga_jual": 50000}],
        "admin_fee": 0, "ongkir": 0, "biaya_lain": 0
    }, headers=admin_h, timeout=15)
    assert sr.status_code in (200, 201), sr.text
    sale = sr.json()
    sid = sale.get("id") or sale.get("_id")
    diterima = sale["omzet"] - sale.get("admin_fee", 0)
    yield {"sid": sid, "diterima": diterima, "pid": pid}
    # cleanup
    requests.delete(f"{BASE_URL}/api/ecommerce/sales/{sid}", headers=admin_h)
    requests.delete(f"{BASE_URL}/api/products/{pid}", headers=admin_h)


def test_kasir_forbidden(test_sale, kasir_h):
    r = requests.put(f"{BASE_URL}/api/ecommerce/sales/{test_sale['sid']}/cair",
                     json={"tanggal": "2026-01-10", "nominal": 50000}, headers=kasir_h)
    assert r.status_code == 403, r.text


def test_invalid_date(test_sale, admin_h):
    r = requests.put(f"{BASE_URL}/api/ecommerce/sales/{test_sale['sid']}/cair",
                     json={"tanggal": "not-a-date", "nominal": 50000}, headers=admin_h)
    assert r.status_code == 400


def test_negative_nominal(test_sale, admin_h):
    r = requests.put(f"{BASE_URL}/api/ecommerce/sales/{test_sale['sid']}/cair",
                     json={"tanggal": "2026-01-10", "nominal": -1}, headers=admin_h)
    assert r.status_code == 400


def test_unknown_id(admin_h):
    r = requests.put(f"{BASE_URL}/api/ecommerce/sales/507f1f77bcf86cd799439011/cair",
                     json={"tanggal": "2026-01-10", "nominal": 1000}, headers=admin_h)
    assert r.status_code == 404


def test_set_and_clear_cair_equal(test_sale, admin_h):
    sid = test_sale["sid"]
    diterima = test_sale["diterima"]
    # Equal => selisih=0
    r = requests.put(f"{BASE_URL}/api/ecommerce/sales/{sid}/cair",
                     json={"tanggal": "2026-01-10", "nominal": diterima}, headers=admin_h)
    assert r.status_code == 200, r.text
    cair = r.json()["cair"]
    assert cair["nominal"] == diterima
    assert cair["selisih"] == 0
    assert cair["tanggal"] == "2026-01-10"
    assert "by" in cair and "at" in cair

    # Positive selisih
    r2 = requests.put(f"{BASE_URL}/api/ecommerce/sales/{sid}/cair",
                      json={"tanggal": "2026-01-11", "nominal": diterima + 500}, headers=admin_h)
    assert r2.status_code == 200
    assert r2.json()["cair"]["selisih"] == 500

    # Verify persistence via list
    lr = requests.get(f"{BASE_URL}/api/ecommerce/sales", headers=admin_h)
    assert lr.status_code == 200
    found = next((s for s in lr.json() if (s.get("id") or s.get("_id")) == sid), None)
    assert found and found.get("cair", {}).get("nominal") == diterima + 500

    # DELETE
    dr = requests.delete(f"{BASE_URL}/api/ecommerce/sales/{sid}/cair", headers=admin_h)
    assert dr.status_code == 200
    # Verify removed
    lr2 = requests.get(f"{BASE_URL}/api/ecommerce/sales", headers=admin_h)
    found2 = next((s for s in lr2.json() if (s.get("id") or s.get("_id")) == sid), None)
    assert found2 is not None
    assert not found2.get("cair")


def test_kasir_delete_forbidden(test_sale, kasir_h):
    r = requests.delete(f"{BASE_URL}/api/ecommerce/sales/{test_sale['sid']}/cair", headers=kasir_h)
    assert r.status_code == 403


def test_reports_bulanan_has_cair_fields(test_sale, admin_h):
    sid = test_sale["sid"]
    diterima = test_sale["diterima"]
    today = datetime.utcnow()
    # Use created date (today in UTC)
    tanggal = today.strftime("%Y-%m-%d")
    requests.put(f"{BASE_URL}/api/ecommerce/sales/{sid}/cair",
                 json={"tanggal": tanggal, "nominal": diterima + 1000}, headers=admin_h)
    try:
        r = requests.get(f"{BASE_URL}/api/ecommerce/reports",
                         params={"mode": "bulanan", "year": today.year, "month": today.month},
                         headers=admin_h)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "daily" in data
        day = next((d for d in data["daily"] if d["date"] == tanggal), None)
        assert day is not None, f"no entry for {tanggal}"
        for k in ("transaksi", "omzet", "potongan", "diterima", "cair", "selisih", "belum_cair"):
            assert k in day, f"missing key {k}"
        assert day["cair"] >= diterima + 1000
    finally:
        requests.delete(f"{BASE_URL}/api/ecommerce/sales/{sid}/cair", headers=admin_h)
