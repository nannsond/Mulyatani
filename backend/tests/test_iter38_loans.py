"""Tests for Pinjaman Modal (loans) feature."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://mulyatani-preview-1.preview.emergentagent.com").rstrip("/")


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_headers():
    return {"Authorization": f"Bearer {_login('nannsond@gmail.com', 'admin123')}"}


@pytest.fixture(scope="module")
def kasir_headers():
    return {"Authorization": f"Bearer {_login('kasir@tokotani.com', 'kasir123')}"}


@pytest.fixture(scope="module")
def created_loan_ids():
    return []


# ---------------- Access control ----------------
class TestAccessControl:
    def test_kasir_forbidden_list(self, kasir_headers):
        r = requests.get(f"{BASE_URL}/api/loans", headers=kasir_headers)
        assert r.status_code == 403

    def test_kasir_forbidden_create(self, kasir_headers):
        r = requests.post(f"{BASE_URL}/api/loans", headers=kasir_headers,
                          json={"lender": "X", "principal": 1000, "interest_rate": 0, "tenor": 1, "start_date": "2026-01-01"})
        assert r.status_code == 403

    def test_admin_list_ok(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/loans", headers=admin_headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ---------------- Loan CRUD + calculation ----------------
class TestLoanLifecycle:
    def test_create_loan_calculations(self, admin_headers, created_loan_ids):
        payload = {"lender": "TEST_BankBRI", "principal": 12000000, "interest_rate": 6,
                   "tenor": 12, "start_date": "2026-01-01", "note": "test"}
        r = requests.post(f"{BASE_URL}/api/loans", headers=admin_headers, json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["lender"] == "TEST_BankBRI"
        # total_interest = 12m*0.06*12/12 = 720000; total_due 12720000; installment 1060000
        assert d["total_interest"] == 720000
        assert d["total_due"] == 12720000
        assert d["installment"] == 1060000
        assert d["paid"] == 0
        assert d["remaining"] == 12720000
        assert d["status"] == "Aktif"
        assert d["due_date"] == "2027-01-01"
        assert d["next_due_date"] == "2026-02-01"
        created_loan_ids.append(d["id"])

    def test_get_loan_in_list(self, admin_headers, created_loan_ids):
        r = requests.get(f"{BASE_URL}/api/loans", headers=admin_headers)
        ids = [x["id"] for x in r.json()]
        assert created_loan_ids[0] in ids

    def test_pay_installment_creates_expense(self, admin_headers, created_loan_ids):
        lid = created_loan_ids[0]
        r = requests.post(f"{BASE_URL}/api/loans/{lid}/payments", headers=admin_headers,
                          json={"amount": 1060000, "date": "2026-02-01", "note": ""})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["paid"] == 1060000
        assert d["remaining"] == 12720000 - 1060000
        # Expense created
        exp = requests.get(f"{BASE_URL}/api/expenses", headers=admin_headers,
                           params={"month": "2026-02"})
        assert exp.status_code == 200
        matches = [e for e in exp.json() if e.get("loan_id") == lid and e["category"] == "Cicilan Pinjaman"]
        assert len(matches) == 1
        assert matches[0]["amount"] == 1060000

    def test_pay_more_than_remaining_rejected(self, admin_headers, created_loan_ids):
        lid = created_loan_ids[0]
        r = requests.post(f"{BASE_URL}/api/loans/{lid}/payments", headers=admin_headers,
                          json={"amount": 99999999, "date": "2026-02-01"})
        assert r.status_code == 400

    def test_delete_payment_also_deletes_expense(self, admin_headers, created_loan_ids):
        lid = created_loan_ids[0]
        loan = requests.get(f"{BASE_URL}/api/loans", headers=admin_headers).json()
        loan = [x for x in loan if x["id"] == lid][0]
        pid = loan["payments"][0]["id"]
        exp_id = loan["payments"][0]["expense_id"]
        r = requests.delete(f"{BASE_URL}/api/loans/{lid}/payments/{pid}", headers=admin_headers)
        assert r.status_code == 200
        assert r.json()["paid"] == 0
        # expense should be gone
        exp = requests.get(f"{BASE_URL}/api/expenses", headers=admin_headers,
                           params={"month": "2026-02"})
        ids = [e["id"] for e in exp.json()]
        assert exp_id not in ids

    def test_delete_expense_also_removes_payment(self, admin_headers, created_loan_ids):
        lid = created_loan_ids[0]
        # make a payment
        r = requests.post(f"{BASE_URL}/api/loans/{lid}/payments", headers=admin_headers,
                          json={"amount": 1060000, "date": "2026-03-01"})
        assert r.status_code == 200
        loan = [x for x in requests.get(f"{BASE_URL}/api/loans", headers=admin_headers).json() if x["id"] == lid][0]
        exp_id = loan["payments"][-1]["expense_id"]
        # delete expense
        d = requests.delete(f"{BASE_URL}/api/expenses/{exp_id}", headers=admin_headers)
        assert d.status_code == 200
        loan = [x for x in requests.get(f"{BASE_URL}/api/loans", headers=admin_headers).json() if x["id"] == lid][0]
        remaining_payments = [p for p in loan["payments"] if p["expense_id"] == exp_id]
        assert remaining_payments == []

    def test_pay_full_marks_lunas(self, admin_headers, created_loan_ids):
        lid = created_loan_ids[0]
        loan = [x for x in requests.get(f"{BASE_URL}/api/loans", headers=admin_headers).json() if x["id"] == lid][0]
        remaining = loan["remaining"]
        r = requests.post(f"{BASE_URL}/api/loans/{lid}/payments", headers=admin_headers,
                          json={"amount": remaining, "date": "2026-04-01"})
        assert r.status_code == 200
        d = r.json()
        assert d["remaining"] == 0
        assert d["status"] == "Lunas"
        assert d["next_due_date"] is None

    def test_delete_loan_cleans_expenses(self, admin_headers, created_loan_ids):
        lid = created_loan_ids[0]
        loan = [x for x in requests.get(f"{BASE_URL}/api/loans", headers=admin_headers).json() if x["id"] == lid][0]
        exp_ids = [p["expense_id"] for p in loan.get("payments", [])]
        r = requests.delete(f"{BASE_URL}/api/loans/{lid}", headers=admin_headers)
        assert r.status_code == 200
        # loan gone
        loans = requests.get(f"{BASE_URL}/api/loans", headers=admin_headers).json()
        assert lid not in [x["id"] for x in loans]
        # expenses gone
        for mo in ("2026-02", "2026-03", "2026-04"):
            exp = requests.get(f"{BASE_URL}/api/expenses", headers=admin_headers, params={"month": mo}).json()
            for eid in exp_ids:
                assert eid not in [e["id"] for e in exp]


def _loan_id_eq(loan, lid):
    return loan["id"] == lid and loan.get("payments")


# ---------- Cleanup pre-existing test loans ----------
def test_zz_cleanup(admin_headers):
    loans = requests.get(f"{BASE_URL}/api/loans", headers=admin_headers).json()
    for l in loans:
        if l["lender"].startswith("TEST_") or l["lender"] == "Bank BRI":
            requests.delete(f"{BASE_URL}/api/loans/{l['id']}", headers=admin_headers)
