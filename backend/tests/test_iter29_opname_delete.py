"""Iteration 29: Stok Opname flat history + DELETE /stok-opname/{id} + month filter data."""
import os
import pytest
import requests
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback to frontend/.env if not in env
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL"):
                BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")

API = f"{BASE_URL}/api"

ADMIN = {"email": "nannsond@gmail.com", "password": "admin123"}
KASIR = {"email": "kasir@tokotani.com", "password": "kasir123"}


def _token(cred):
    r = requests.post(f"{API}/auth/login", json=cred, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_h():
    return {"Authorization": f"Bearer {_token(ADMIN)}"}


@pytest.fixture(scope="module")
def kasir_h():
    return {"Authorization": f"Bearer {_token(KASIR)}"}


@pytest.fixture(scope="module")
def sample_product(admin_h):
    r = requests.get(f"{API}/products", headers=admin_h, timeout=15)
    assert r.status_code == 200
    prods = r.json()
    # pick a CONTOH product
    p = next((x for x in prods if x.get("sku", "").startswith("CONTOH-")), prods[0])
    return p


# ---- Flat history endpoint ----
def test_history_is_flat_list(admin_h):
    r = requests.get(f"{API}/stok-opname", headers=admin_h, timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    if data:
        row = data[0]
        for k in ("id", "product_name", "stok_sistem", "stok_fisik", "selisih", "created_at"):
            assert k in row, f"missing {k}"
        assert "_id" not in row


# ---- DELETE permissions ----
def _create_opname(admin_h, product):
    """Create then restore stock to original so test is non-destructive."""
    original = product["stok"]
    r = requests.post(f"{API}/stok-opname", headers=admin_h,
                      json={"product_id": product["id"], "stok_fisik": original,
                            "alasan": "Sesuai", "note": "TEST_iter29"}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["id"]


def test_delete_opname_admin_200(admin_h, sample_product):
    oid = _create_opname(admin_h, sample_product)
    r = requests.delete(f"{API}/stok-opname/{oid}", headers=admin_h, timeout=15)
    assert r.status_code == 200
    assert r.json().get("ok") is True
    # verify stock unchanged
    rp = requests.get(f"{API}/products", headers=admin_h, timeout=15).json()
    p = next(x for x in rp if x["id"] == sample_product["id"])
    assert p["stok"] == sample_product["stok"], "Stock must remain unchanged after delete"


def test_delete_opname_kasir_403(admin_h, kasir_h, sample_product):
    oid = _create_opname(admin_h, sample_product)
    r = requests.delete(f"{API}/stok-opname/{oid}", headers=kasir_h, timeout=15)
    assert r.status_code == 403
    # cleanup
    requests.delete(f"{API}/stok-opname/{oid}", headers=admin_h, timeout=15)


def test_delete_opname_invalid_id_404(admin_h):
    r = requests.delete(f"{API}/stok-opname/not-a-valid-id", headers=admin_h, timeout=15)
    assert r.status_code == 404


def test_delete_opname_unknown_id_404(admin_h):
    r = requests.delete(f"{API}/stok-opname/507f1f77bcf86cd799439011", headers=admin_h, timeout=15)
    assert r.status_code == 404


def test_delete_opname_unauth_401(sample_product):
    r = requests.delete(f"{API}/stok-opname/507f1f77bcf86cd799439011", timeout=15)
    assert r.status_code in (401, 403)


# ---- Sample stock integrity check ----
def test_sample_stocks_preserved(admin_h):
    r = requests.get(f"{API}/products", headers=admin_h, timeout=15)
    assert r.status_code == 200
    expected = {"CONTOH-001": 44, "CONTOH-002": 36, "CONTOH-003": 30, "CONTOH-004": 1, "CONTOH-005": 25}
    actual = {p["sku"]: p["stok"] for p in r.json() if p.get("sku") in expected}
    for sku, exp in expected.items():
        if sku in actual:
            assert actual[sku] == exp, f"{sku} drifted: got {actual[sku]} expected {exp}"
