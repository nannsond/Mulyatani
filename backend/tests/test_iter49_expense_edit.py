"""Iteration 49: Expense (Pengeluaran) edit endpoint tests."""
import os
import requests
import pytest

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://mulyatani-1.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"

ADMIN = {"email": "nannsond@gmail.com", "password": "admin123"}
KASIR = {"email": "kasir@tokotani.com", "password": "kasir123"}


def _login(cred):
    r = requests.post(f"{API}/auth/login", json=cred, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_h():
    return {"Authorization": f"Bearer {_login(ADMIN)}"}


@pytest.fixture(scope="module")
def kasir_h():
    return {"Authorization": f"Bearer {_login(KASIR)}"}


@pytest.fixture
def created_expense(admin_h):
    payload = {"category": "Operasional", "amount": 50000, "note": "TEST_iter49", "date": "2026-01-10"}
    r = requests.post(f"{API}/expenses", json=payload, headers=admin_h, timeout=20)
    assert r.status_code == 200, r.text
    eid = r.json()["id"]
    yield r.json()
    requests.delete(f"{API}/expenses/{eid}", headers=admin_h, timeout=20)


def test_update_basic(admin_h, created_expense):
    eid = created_expense["id"]
    orig_created = created_expense["created_at"]
    body = {"category": "Transport", "amount": 75000, "note": "TEST_iter49_upd", "date": orig_created[:10]}
    r = requests.put(f"{API}/expenses/{eid}", json=body, headers=admin_h, timeout=20)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["category"] == "Transport"
    assert d["amount"] == 75000
    assert d["note"] == "TEST_iter49_upd"
    # same date -> created_at preserved
    assert d["created_at"] == orig_created
    # verify via GET
    g = requests.get(f"{API}/expenses?month={orig_created[:7]}", headers=admin_h, timeout=20).json()
    found = [x for x in g if x["id"] == eid][0]
    assert found["amount"] == 75000


def test_update_date_moves_month(admin_h, created_expense):
    eid = created_expense["id"]
    new_date = "2025-12-15"
    body = {"category": "Operasional", "amount": 50000, "note": "TEST_iter49", "date": new_date}
    r = requests.put(f"{API}/expenses/{eid}", json=body, headers=admin_h, timeout=20)
    assert r.status_code == 200
    assert r.json()["created_at"][:10] == new_date
    g_new = requests.get(f"{API}/expenses?month=2025-12", headers=admin_h, timeout=20).json()
    assert any(x["id"] == eid for x in g_new)
    g_old = requests.get(f"{API}/expenses?month=2026-01", headers=admin_h, timeout=20).json()
    assert not any(x["id"] == eid for x in g_old)


def test_update_kasir_forbidden(kasir_h, created_expense):
    body = {"category": "Transport", "amount": 10000, "note": "x", "date": "2026-01-10"}
    r = requests.put(f"{API}/expenses/{created_expense['id']}", json=body, headers=kasir_h, timeout=20)
    assert r.status_code == 403


def test_update_invalid_id(admin_h):
    body = {"category": "Transport", "amount": 10000, "note": "x", "date": "2026-01-10"}
    r = requests.put(f"{API}/expenses/507f1f77bcf86cd799439011", json=body, headers=admin_h, timeout=20)
    assert r.status_code == 404
    r2 = requests.put(f"{API}/expenses/not-an-objectid", json=body, headers=admin_h, timeout=20)
    assert r2.status_code == 404


def test_update_amount_zero(admin_h, created_expense):
    body = {"category": "Transport", "amount": 0, "note": "x", "date": "2026-01-10"}
    r = requests.put(f"{API}/expenses/{created_expense['id']}", json=body, headers=admin_h, timeout=20)
    assert r.status_code == 400
    body["amount"] = -5
    r2 = requests.put(f"{API}/expenses/{created_expense['id']}", json=body, headers=admin_h, timeout=20)
    assert r2.status_code == 400


def test_update_loan_installment_blocked(admin_h):
    # Create a loan then make a payment -> an expense with loan_id is created
    loan_body = {
        "lender": "TEST_iter49_lender", "principal": 1000000, "interest_rate": 12,
        "tenor": 6, "start_date": "2026-01-01", "note": "TEST", "disbursed": True
    }
    lr = requests.post(f"{API}/loans", json=loan_body, headers=admin_h, timeout=20)
    assert lr.status_code == 200, lr.text
    lid = lr.json()["id"]
    try:
        pay = {"amount": 180000, "date": "2026-01-05", "note": "TEST pay"}
        pr = requests.post(f"{API}/loans/{lid}/payments", json=pay, headers=admin_h, timeout=20)
        assert pr.status_code == 200, pr.text
        # find expense with this loan via list
        exps = requests.get(f"{API}/expenses?month=2026-01", headers=admin_h, timeout=20).json()
        # find expense tied to loan by matching amount+date and loan_id (loan_id not necessarily returned, filter by note or amount)
        candidates = [x for x in exps if x["amount"] == 180000]
        assert candidates, "No expense from loan payment found"
        eid = candidates[0]["id"]
        body = {"category": "Operasional", "amount": 999, "note": "x", "date": "2026-01-05"}
        r = requests.put(f"{API}/expenses/{eid}", json=body, headers=admin_h, timeout=20)
        assert r.status_code == 400
        assert "Pinjaman Modal" in r.json().get("detail", "")
    finally:
        requests.delete(f"{API}/loans/{lid}", headers=admin_h, timeout=20)


def test_create_and_delete_still_work(admin_h):
    body = {"category": "Lainnya", "amount": 1234, "note": "TEST_iter49_cd", "date": "2026-01-20"}
    r = requests.post(f"{API}/expenses", json=body, headers=admin_h, timeout=20)
    assert r.status_code == 200
    eid = r.json()["id"]
    d = requests.delete(f"{API}/expenses/{eid}", headers=admin_h, timeout=20)
    assert d.status_code == 200
