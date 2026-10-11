"""Iteration 20: Payroll slip features - kota/penandatangan settings, bonus_items, potongan_lain."""
import os

import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
ADMIN_EMAIL = "nannsond@gmail.com"
ADMIN_PASS = "admin123"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
    assert r.status_code == 200, r.text
    return r.json()["access_token"] if "access_token" in r.json() else r.json().get("token")


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def test_user(headers):
    # Create a TEST_ kasir user
    payload = {"email": "test_payslip_iter20@example.com", "password": "test123", "name": "TEST_Payslip", "role": "kasir"}
    r = requests.post(f"{BASE_URL}/api/users", json=payload, headers=headers)
    if r.status_code == 400:
        # Already exists -> find
        users = requests.get(f"{BASE_URL}/api/users", headers=headers).json()
        u = next((u for u in users if u["email"] == payload["email"]), None)
        assert u, "could not find existing test user"
        uid = u["id"]
    else:
        assert r.status_code == 200, r.text
        uid = r.json()["id"]
    yield uid
    # Teardown: delete test user, employee_salary and payroll overrides
    requests.delete(f"{BASE_URL}/api/users/{uid}", headers=headers)
    # Reset payroll settings kota/penandatangan to empty
    requests.post(f"{BASE_URL}/api/payroll/settings",
                  json={"potongan_telat": 0, "hari_kerja": 26, "kota": "", "penandatangan": ""},
                  headers=headers)


# --- Settings ---
def test_payroll_settings_accept_kota_ttd(headers):
    payload = {"potongan_telat": 10000, "hari_kerja": 26, "kota": "Madiun", "penandatangan": "Pak Owner"}
    r = requests.post(f"{BASE_URL}/api/payroll/settings", json=payload, headers=headers)
    assert r.status_code == 200, r.text
    g = requests.get(f"{BASE_URL}/api/payroll/settings", headers=headers)
    assert g.status_code == 200
    data = g.json()
    assert data["kota"] == "Madiun"
    assert data["penandatangan"] == "Pak Owner"
    assert data["potongan_telat"] == 10000
    assert data["hari_kerja"] == 26


# --- Report returns new fields ---
def test_payroll_report_contains_new_fields(headers):
    import datetime
    month = datetime.date.today().strftime("%Y-%m")
    r = requests.get(f"{BASE_URL}/api/payroll/report?month={month}", headers=headers)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "kota" in data
    assert "penandatangan" in data
    assert "rows" in data
    if data["rows"]:
        row = data["rows"][0]
        for key in ["bonus_items", "potongan_lain", "potongan_lain_ket", "potongan_alpha", "potongan_telat_calc"]:
            assert key in row, f"missing {key} in row"


# --- Save with bonus_items + potongan_lain ---
def test_payroll_save_with_bonus_and_potlain(headers, test_user):
    import datetime
    month = datetime.date.today().strftime("%Y-%m")
    payload = {
        "user_id": test_user, "month": month,
        "gaji_pokok": 1700000, "komisi": 0, "potongan": 196155,
        "bonus_items": [
            {"keterangan": "Komisi TiktokShop", "jumlah": 224588},
            {"keterangan": "Angkat Pupuk 7/10", "jumlah": 57000}
        ],
        "potongan_lain": 0, "potongan_lain_ket": ""
    }
    r = requests.post(f"{BASE_URL}/api/payroll/save", json=payload, headers=headers)
    assert r.status_code == 200, r.text
    # Total = 1700000 + 0 + (224588+57000) - 196155 - 0 = 1785433
    expected_total = 1700000 + 224588 + 57000 - 196155
    assert r.json()["total"] == expected_total

    # Verify persisted via GET report
    rep = requests.get(f"{BASE_URL}/api/payroll/report?month={month}", headers=headers).json()
    row = next((x for x in rep["rows"] if x["user_id"] == test_user), None)
    assert row is not None
    assert len(row["bonus_items"]) == 2
    assert sum(b["jumlah"] for b in row["bonus_items"]) == 224588 + 57000
    assert row["total"] == expected_total


def test_payroll_save_with_potongan_lain(headers, test_user):
    import datetime
    month = datetime.date.today().strftime("%Y-%m")
    payload = {
        "user_id": test_user, "month": month,
        "gaji_pokok": 2000000, "komisi": 100000, "potongan": 50000,
        "bonus_items": [{"keterangan": "Lembur", "jumlah": 75000}],
        "potongan_lain": 150000, "potongan_lain_ket": "Kasbon"
    }
    r = requests.post(f"{BASE_URL}/api/payroll/save", json=payload, headers=headers)
    assert r.status_code == 200
    expected = 2000000 + 100000 + 75000 - 50000 - 150000
    assert r.json()["total"] == expected
    rep = requests.get(f"{BASE_URL}/api/payroll/report?month={month}", headers=headers).json()
    row = next((x for x in rep["rows"] if x["user_id"] == test_user), None)
    assert row["potongan_lain"] == 150000
    assert row["potongan_lain_ket"] == "Kasbon"


# --- Archive keeps bonus and total ---
def test_payroll_archive_keeps_total(headers, test_user):
    import datetime
    month = datetime.date.today().strftime("%Y-%m")
    r = requests.post(f"{BASE_URL}/api/payroll/archive", json={"month": month}, headers=headers)
    assert r.status_code == 200, r.text
    arch = requests.get(f"{BASE_URL}/api/payroll/archives", headers=headers).json()
    entry = next((a for a in arch if a["month"] == month), None)
    assert entry is not None
    # Clean up override for test user
    requests.delete(f"{BASE_URL}/api/payroll/override?user_id={test_user}&month={month}", headers=headers)
