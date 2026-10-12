"""Tests for Dana Masuk Kas (loan disbursement) feature - iteration 39."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://mulyatani-preview-1.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": "nannsond@gmail.com", "password": "admin123"})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def kasir_token():
    r = requests.post(f"{API}/auth/login", json={"email": "kasir@tokotani.com", "password": "kasir123"})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_h(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def kasir_h(kasir_token):
    return {"Authorization": f"Bearer {kasir_token}"}


@pytest.fixture(scope="module")
def created_loan_ids():
    ids = []
    yield ids
    # cleanup
    token = requests.post(f"{API}/auth/login", json={"email": "nannsond@gmail.com", "password": "admin123"}).json()["token"]
    h = {"Authorization": f"Bearer {token}"}
    for lid in ids:
        requests.delete(f"{API}/loans/{lid}", headers=h)


def _cash(h, period=None):
    url = f"{API}/reports/cash"
    if period:
        url += f"?period={period}"
    r = requests.get(url, headers=h)
    assert r.status_code == 200, r.text
    return r.json()


def test_cash_report_has_pinjaman_masuk(admin_h):
    c = _cash(admin_h)
    assert "pinjaman_masuk" in c
    assert isinstance(c["pinjaman_masuk"], (int, float))
    assert "kas_saat_ini" in c


def test_create_loan_disbursed_true_increases_kas(admin_h, created_loan_ids):
    before = _cash(admin_h)["pinjaman_masuk"]
    kas_before = _cash(admin_h)["kas_saat_ini"]
    payload = {
        "lender": "TEST_ITER39_Disbursed",
        "principal": 5000000,
        "interest_rate": 6,
        "tenor": 12,
        "start_date": "2026-01-15",
        "disbursed": True,
        "disbursed_date": "2026-01-15",
    }
    r = requests.post(f"{API}/loans", json=payload, headers=admin_h)
    assert r.status_code == 200, r.text
    loan = r.json()
    created_loan_ids.append(loan["id"])
    assert loan["disbursed"] is True
    assert loan["disbursed_date"] == "2026-01-15"

    after = _cash(admin_h)
    assert after["pinjaman_masuk"] == before + 5000000
    assert after["kas_saat_ini"] == kas_before + 5000000


def test_create_loan_disbursed_false_no_kas_impact(admin_h, created_loan_ids):
    before = _cash(admin_h)["pinjaman_masuk"]
    payload = {
        "lender": "TEST_ITER39_NotDisbursed",
        "principal": 3000000,
        "interest_rate": 6,
        "tenor": 12,
        "start_date": "2026-01-15",
        "disbursed": False,
    }
    r = requests.post(f"{API}/loans", json=payload, headers=admin_h)
    assert r.status_code == 200, r.text
    loan = r.json()
    created_loan_ids.append(loan["id"])
    assert loan["disbursed"] is False
    assert loan["disbursed_date"] is None

    after = _cash(admin_h)["pinjaman_masuk"]
    assert after == before, "Non-disbursed loan should not affect pinjaman_masuk"


def test_patch_disbursement_toggle(admin_h, created_loan_ids):
    # Toggle the non-disbursed loan to disbursed
    lid = created_loan_ids[1]  # the NotDisbursed one
    before = _cash(admin_h)["pinjaman_masuk"]
    r = requests.patch(f"{API}/loans/{lid}/disbursement",
                       json={"disbursed": True, "disbursed_date": "2026-01-20"},
                       headers=admin_h)
    assert r.status_code == 200, r.text
    loan = r.json()
    assert loan["disbursed"] is True
    assert loan["disbursed_date"] == "2026-01-20"

    after = _cash(admin_h)["pinjaman_masuk"]
    assert after == before + 3000000

    # Toggle back off
    r2 = requests.patch(f"{API}/loans/{lid}/disbursement",
                        json={"disbursed": False},
                        headers=admin_h)
    assert r2.status_code == 200
    assert r2.json()["disbursed"] is False
    assert r2.json()["disbursed_date"] is None

    assert _cash(admin_h)["pinjaman_masuk"] == before


def test_kasir_cannot_patch_disbursement(kasir_h, admin_h, created_loan_ids):
    lid = created_loan_ids[0]
    r = requests.patch(f"{API}/loans/{lid}/disbursement",
                       json={"disbursed": False},
                       headers=kasir_h)
    assert r.status_code == 403


def test_period_scope_filters_by_disbursed_date(admin_h, created_loan_ids):
    # The disbursed loan is 2026-01-15. Query period 2026-01 includes it, 2025-12 doesn't.
    jan = _cash(admin_h, period="2026-01")
    dec = _cash(admin_h, period="2025-12")
    assert jan["is_period"] is True
    assert jan["pinjaman_masuk"] >= 5000000  # at least our disbursed loan
    # dec should not include our loan dated 2026-01-15
    assert dec["pinjaman_masuk"] < jan["pinjaman_masuk"]


def test_patch_nonexistent_loan_404(admin_h):
    r = requests.patch(f"{API}/loans/507f1f77bcf86cd799439011/disbursement",
                       json={"disbursed": True},
                       headers=admin_h)
    assert r.status_code == 404
