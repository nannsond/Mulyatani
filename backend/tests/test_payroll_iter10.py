"""Iteration 10 - REKAP GAJI (payroll) tests."""
import os
import pytest
import requests
from datetime import datetime

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://mulyatani-preview.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "nannsond@gmail.com", "password": "T0k0Mulya#Tani2026"}
KASIR = {"email": "kasir@tokotani.com", "password": "Kasir#Mulya2026"}

CURRENT_MONTH = "2026-10"
OTHER_MONTH = "2026-11"


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, f"Login failed {creds['email']}: {r.status_code} {r.text}"
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


# ---------- Payroll Settings ----------
class TestPayrollSettings:
    def test_set_settings_admin(self, admin_h):
        r = requests.post(f"{API}/payroll/settings", json={"potongan_telat": 25000}, headers=admin_h, timeout=15)
        assert r.status_code == 200
        assert r.json()["potongan_telat"] == 25000

    def test_get_settings(self, admin_h):
        r = requests.get(f"{API}/payroll/settings", headers=admin_h, timeout=15)
        assert r.status_code == 200
        assert r.json()["potongan_telat"] == 25000

    def test_set_settings_kasir_forbidden(self, kasir_h):
        r = requests.post(f"{API}/payroll/settings", json={"potongan_telat": 1000}, headers=kasir_h, timeout=15)
        assert r.status_code == 403


# ---------- Payroll Report ----------
class TestPayrollReport:
    def test_report_admin(self, admin_h):
        r = requests.get(f"{API}/payroll/report?month={CURRENT_MONTH}", headers=admin_h, timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert data["month"] == CURRENT_MONTH
        assert "rows" in data and isinstance(data["rows"], list)
        assert "commission_rate" in data
        assert data["potongan_telat"] == 25000
        for row in data["rows"]:
            for k in ("user_id", "user_name", "hadir", "telat", "gaji_pokok", "komisi", "potongan", "total", "edited"):
                assert k in row, f"missing {k}"
            # Verify total formula for non-edited rows
            if not row["edited"]:
                expected = row["gaji_pokok"] + row["komisi"] - row["potongan"]
                assert abs(row["total"] - expected) < 0.01

    def test_report_kasir_forbidden(self, kasir_h):
        r = requests.get(f"{API}/payroll/report?month={CURRENT_MONTH}", headers=kasir_h, timeout=15)
        assert r.status_code == 403


# ---------- Save & Reset Override ----------
class TestPayrollSaveReset:
    @pytest.fixture(scope="class")
    def target_user(self, admin_h):
        r = requests.get(f"{API}/payroll/report?month={CURRENT_MONTH}", headers=admin_h, timeout=20)
        rows = r.json()["rows"]
        # pick a kasir role user if any, else first
        kasir_rows = [row for row in rows if row.get("role") == "kasir"]
        return (kasir_rows or rows)[0]

    def test_save_override_persists(self, admin_h, target_user):
        uid = target_user["user_id"]
        payload = {"user_id": uid, "month": CURRENT_MONTH, "gaji_pokok": 3000000, "komisi": 150000, "potongan": 50000}
        r = requests.post(f"{API}/payroll/save", json=payload, headers=admin_h, timeout=15)
        assert r.status_code == 200
        assert r.json()["total"] == 3000000 + 150000 - 50000

        # Verify report shows edited=true with values
        r2 = requests.get(f"{API}/payroll/report?month={CURRENT_MONTH}", headers=admin_h, timeout=20)
        row = next(x for x in r2.json()["rows"] if x["user_id"] == uid)
        assert row["edited"] is True
        assert row["gaji_pokok"] == 3000000
        assert row["komisi"] == 150000
        assert row["potongan"] == 50000
        assert row["total"] == 3100000

    def test_base_salary_reused_next_month(self, admin_h, target_user):
        uid = target_user["user_id"]
        r = requests.get(f"{API}/payroll/report?month={OTHER_MONTH}", headers=admin_h, timeout=20)
        assert r.status_code == 200
        row = next(x for x in r.json()["rows"] if x["user_id"] == uid)
        assert row["edited"] is False
        assert row["gaji_pokok"] == 3000000, f"Base salary not reused: {row['gaji_pokok']}"

    def test_reset_override(self, admin_h, target_user):
        uid = target_user["user_id"]
        r = requests.delete(f"{API}/payroll/override?user_id={uid}&month={CURRENT_MONTH}", headers=admin_h, timeout=15)
        assert r.status_code == 200
        r2 = requests.get(f"{API}/payroll/report?month={CURRENT_MONTH}", headers=admin_h, timeout=20)
        row = next(x for x in r2.json()["rows"] if x["user_id"] == uid)
        assert row["edited"] is False
        # Base salary still equals the one we saved (reused)
        assert row["gaji_pokok"] == 3000000
        # komisi should be computed value (komisi_calc)
        assert abs(row["komisi"] - row["komisi_calc"]) < 0.01

    def test_save_kasir_forbidden(self, kasir_h, target_user):
        payload = {"user_id": target_user["user_id"], "month": CURRENT_MONTH, "gaji_pokok": 1, "komisi": 0, "potongan": 0}
        r = requests.post(f"{API}/payroll/save", json=payload, headers=kasir_h, timeout=15)
        assert r.status_code == 403

    def test_reset_kasir_forbidden(self, kasir_h, target_user):
        r = requests.delete(f"{API}/payroll/override?user_id={target_user['user_id']}&month={CURRENT_MONTH}", headers=kasir_h, timeout=15)
        assert r.status_code == 403
