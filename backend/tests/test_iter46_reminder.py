"""Iter46: Debt reminder (Tagih via WhatsApp) backend tests."""
import os
import time
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for ln in f:
            if ln.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = ln.split("=", 1)[1].strip().rstrip("/")

API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": "nannsond@gmail.com", "password": "admin123"})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def product(headers):
    r = requests.post(f"{API}/products", headers=headers, json={
        "sku": "TEST-REM-001", "name": "TEST Reminder Item", "category": "TEST",
        "harga_beli": 1000, "harga_jual": 5000, "stok": 100
    })
    # Allow duplicate from previous run
    if r.status_code >= 400:
        lst = requests.get(f"{API}/products", headers=headers).json()
        for p in (lst if isinstance(lst, list) else lst.get("items", [])):
            if p.get("sku") == "TEST-REM-001":
                return p
        pytest.skip(f"Product create failed: {r.text}")
    return r.json()


@pytest.fixture(scope="module")
def credit_tx(headers, product):
    """Create partial-paid (credit) POS transaction with telepon."""
    r = requests.post(f"{API}/transactions", headers=headers, json={
        "items": [{"product_id": product["id"], "name": product["name"], "qty": 2, "harga": 5000}],
        "customer_name": "TEST Reminder Customer",
        "telepon": "081234567890",
        "amount_paid": 3000,  # total=10000, partial
    })
    assert r.status_code == 200, r.text
    tx = r.json()
    assert tx["status"] == "sebagian"
    assert tx["telepon"] == "081234567890"
    return tx


def test_piutang_lists_credit_tx(headers, credit_tx):
    r = requests.get(f"{API}/piutang", headers=headers)
    assert r.status_code == 200
    found = [x for x in r.json() if x["id"] == credit_tx["id"]]
    assert len(found) == 1
    assert found[0]["sisa"] == 7000
    assert found[0].get("telepon") == "081234567890"


def test_mark_reminded_first_call(headers, credit_tx):
    r = requests.post(f"{API}/transactions/{credit_tx['id']}/reminded", headers=headers)
    assert r.status_code == 200, r.text
    assert r.json() == {"ok": True}

    # Verify persistence via /piutang
    lst = requests.get(f"{API}/piutang", headers=headers).json()
    row = next(x for x in lst if x["id"] == credit_tx["id"])
    assert row.get("reminder_count") == 1
    assert row.get("last_reminder_at")
    assert row.get("last_reminder_by")  # should be user name


def test_mark_reminded_increments(headers, credit_tx):
    time.sleep(1)
    r = requests.post(f"{API}/transactions/{credit_tx['id']}/reminded", headers=headers)
    assert r.status_code == 200
    r = requests.post(f"{API}/transactions/{credit_tx['id']}/reminded", headers=headers)
    assert r.status_code == 200

    lst = requests.get(f"{API}/piutang", headers=headers).json()
    row = next(x for x in lst if x["id"] == credit_tx["id"])
    assert row.get("reminder_count") == 3


def test_mark_reminded_unknown_id(headers):
    # Valid ObjectId format but non-existent
    fake = "507f1f77bcf86cd799439011"
    r = requests.post(f"{API}/transactions/{fake}/reminded", headers=headers)
    assert r.status_code == 404


def test_mark_reminded_requires_auth():
    r = requests.post(f"{API}/transactions/507f1f77bcf86cd799439011/reminded")
    assert r.status_code in (401, 403)


def test_cleanup(headers, credit_tx):
    # Try to delete transaction and product for cleanup
    requests.delete(f"{API}/transactions/{credit_tx['id']}", headers=headers)
