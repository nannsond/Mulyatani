"""Iter50: Daily report returns expenses, total_pengeluaran, laba_bersih."""
import os
import pytest
import requests
from datetime import date as _date

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://mulyatani-1.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"

ADMIN = {"email": "nannsond@gmail.com", "password": "admin123"}


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def H(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def today():
    return _date.today().isoformat()


def _get_daily(H, d):
    r = requests.get(f"{API}/reports/daily", params={"date": d}, headers=H, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


def test_daily_report_schema(H, today):
    body = _get_daily(H, today)
    assert "summary" in body and "expenses" in body
    s = body["summary"]
    for k in ("total_pengeluaran", "potongan_platform", "laba_bersih", "total_laba"):
        assert k in s, f"missing {k}"
    assert isinstance(body["expenses"], list)
    for e in body["expenses"]:
        for k in ("id", "category", "note", "amount", "created_at"):
            assert k in e


def test_add_expense_updates_daily(H, today):
    before = _get_daily(H, today)
    s_before = before["summary"]
    peng_before = s_before["total_pengeluaran"]
    laba_before = s_before["laba_bersih"]
    n_before = len(before["expenses"])

    payload = {"category": "TEST_ITER50", "amount": 12345, "note": "TEST_iter50_note", "date": today}
    r = requests.post(f"{API}/expenses", json=payload, headers=H, timeout=30)
    assert r.status_code == 200, r.text
    eid = r.json()["id"]

    try:
        after = _get_daily(H, today)
        s_after = after["summary"]
        assert s_after["total_pengeluaran"] == peng_before + 12345
        assert s_after["laba_bersih"] == laba_before - 12345
        assert len(after["expenses"]) == n_before + 1
        found = [e for e in after["expenses"] if e["id"] == eid]
        assert len(found) == 1
        assert found[0]["amount"] == 12345
        assert found[0]["note"] == "TEST_iter50_note"

        # formula check
        assert s_after["laba_bersih"] == s_after["total_laba"] - s_after["potongan_platform"] - s_after["total_pengeluaran"]

        # Edit
        r2 = requests.put(f"{API}/expenses/{eid}", json={"category": "TEST_ITER50", "amount": 20000, "note": "edited", "date": today}, headers=H, timeout=30)
        assert r2.status_code == 200, r2.text
        after2 = _get_daily(H, today)
        assert after2["summary"]["total_pengeluaran"] == peng_before + 20000
        assert after2["summary"]["laba_bersih"] == laba_before - 20000

    finally:
        requests.delete(f"{API}/expenses/{eid}", headers=H, timeout=30)

    final = _get_daily(H, today)
    assert final["summary"]["total_pengeluaran"] == peng_before
    assert final["summary"]["laba_bersih"] == laba_before


def test_expense_excluded_from_other_date(H, today):
    other = "2023-01-15"
    payload = {"category": "TEST_ITER50_OTHER", "amount": 999, "note": "oth", "date": other}
    r = requests.post(f"{API}/expenses", json=payload, headers=H, timeout=30)
    assert r.status_code == 200
    eid = r.json()["id"]
    try:
        today_body = _get_daily(H, today)
        assert not any(e["id"] == eid for e in today_body["expenses"])
        oth_body = _get_daily(H, other)
        assert any(e["id"] == eid for e in oth_body["expenses"])
    finally:
        requests.delete(f"{API}/expenses/{eid}", headers=H, timeout=30)


def test_monthly_regression(H, today):
    y, m = int(today[:4]), int(today[5:7])
    r = requests.get(f"{API}/reports/monthly", params={"year": y, "month": m}, headers=H, timeout=30)
    assert r.status_code == 200
    s = r.json()["summary"]
    assert "laba_bersih" in s
    assert s["laba_bersih"] == s["total_laba"] - s["potongan_platform"] - s["total_pengeluaran"]
