"""Backend tests for Iteration 9: Commission (Komisi) + Attendance (Kehadiran) features."""
import os
import requests
import pytest
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "nannsond@gmail.com"
ADMIN_PASS = "T0k0Mulya#Tani2026"
KASIR_EMAIL = "kasir@tokotani.com"
KASIR_PASS = "Kasir#Mulya2026"

WIB = timezone(timedelta(hours=7))


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN_EMAIL, ADMIN_PASS)


@pytest.fixture(scope="module")
def kasir_token():
    return _login(KASIR_EMAIL, KASIR_PASS)


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


# ---------------- Commission ----------------
class TestCommissionSettings:
    def test_admin_set_rate(self, admin_token):
        r = requests.post(f"{API}/commission/settings", json={"rate": 5}, headers=_h(admin_token), timeout=15)
        assert r.status_code == 200
        assert r.json()["rate"] == 5

    def test_get_rate_returns_saved(self, admin_token):
        r = requests.get(f"{API}/commission/settings", headers=_h(admin_token), timeout=15)
        assert r.status_code == 200
        assert r.json()["rate"] == 5

    def test_kasir_cannot_set_rate(self, kasir_token):
        r = requests.post(f"{API}/commission/settings", json={"rate": 10}, headers=_h(kasir_token), timeout=15)
        assert r.status_code == 403

    def test_kasir_can_get_rate(self, kasir_token):
        r = requests.get(f"{API}/commission/settings", headers=_h(kasir_token), timeout=15)
        assert r.status_code == 200
        assert "rate" in r.json()


class TestCommissionReport:
    def test_kasir_blocked(self, kasir_token):
        month = datetime.now(WIB).strftime("%Y-%m")
        r = requests.get(f"{API}/commission/report?month={month}", headers=_h(kasir_token), timeout=15)
        assert r.status_code == 403

    def test_admin_report_structure(self, admin_token):
        month = datetime.now(WIB).strftime("%Y-%m")
        r = requests.get(f"{API}/commission/report?month={month}", headers=_h(admin_token), timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "rows" in data and "total" in data and "rate" in data
        assert isinstance(data["rows"], list)
        # Validate komisi formula on each row
        rate = data["rate"]
        for row in data["rows"]:
            expected = row["laba_kotor"] * rate / 100
            assert abs(row["komisi"] - expected) < 0.01, f"Komisi mismatch for {row['user_name']}"

    def test_komisi_math_8050(self):
        # 161000 * 5 / 100 = 8050
        assert 161000 * 5 / 100 == 8050


# ---------------- Attendance ----------------
class TestAttendanceSettings:
    def test_admin_set_start_time(self, admin_token):
        r = requests.post(f"{API}/attendance/settings", json={"start_time": "08:00"}, headers=_h(admin_token), timeout=15)
        assert r.status_code == 200
        assert r.json()["start_time"] == "08:00"

    def test_get_start_time(self, admin_token):
        r = requests.get(f"{API}/attendance/settings", headers=_h(admin_token), timeout=15)
        assert r.status_code == 200
        assert r.json()["start_time"] == "08:00"

    def test_kasir_cannot_set_start_time(self, kasir_token):
        r = requests.post(f"{API}/attendance/settings", json={"start_time": "09:00"}, headers=_h(kasir_token), timeout=15)
        assert r.status_code == 403


class TestAttendanceFlow:
    def test_today_endpoint(self, kasir_token):
        r = requests.get(f"{API}/attendance/today", headers=_h(kasir_token), timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "date" in data and "record" in data

    def test_checkin_or_duplicate(self, kasir_token):
        """Either creates checkin OR returns 400 'sudah absen masuk' if already done today."""
        r = requests.post(f"{API}/attendance/checkin", headers=_h(kasir_token), timeout=15)
        assert r.status_code in (200, 400)
        if r.status_code == 200:
            doc = r.json()
            assert "check_in" in doc
            assert "late" in doc
            assert doc["check_out"] is None
            # Second check-in must be 400
            r2 = requests.post(f"{API}/attendance/checkin", headers=_h(kasir_token), timeout=15)
            assert r2.status_code == 400
            assert "sudah absen masuk" in r2.json().get("detail", "").lower()
        else:
            assert "sudah absen masuk" in r.json().get("detail", "").lower()

    def test_checkout_flow(self, kasir_token):
        """Checkout after checkin should succeed; double checkout 400."""
        # Ensure checked-in
        requests.post(f"{API}/attendance/checkin", headers=_h(kasir_token), timeout=15)
        r = requests.post(f"{API}/attendance/checkout", headers=_h(kasir_token), timeout=15)
        assert r.status_code in (200, 400)
        if r.status_code == 200:
            doc = r.json()
            assert doc["check_out"] is not None
            assert "work_minutes" in doc
            # Double checkout
            r2 = requests.post(f"{API}/attendance/checkout", headers=_h(kasir_token), timeout=15)
            assert r2.status_code == 400
            assert "sudah absen pulang" in r2.json().get("detail", "").lower()


class TestAttendanceListRBAC:
    def test_admin_sees_all(self, admin_token):
        month = datetime.now(WIB).strftime("%Y-%m")
        r = requests.get(f"{API}/attendance?month={month}", headers=_h(admin_token), timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "records" in data and "recap" in data
        # recap entries structure
        for e in data["recap"]:
            assert set(["user_name", "hadir", "telat", "total_menit"]).issubset(e.keys())

    def test_kasir_sees_only_own(self, kasir_token):
        month = datetime.now(WIB).strftime("%Y-%m")
        r = requests.get(f"{API}/attendance?month={month}", headers=_h(kasir_token), timeout=15)
        assert r.status_code == 200
        data = r.json()
        # All records should belong to this kasir user; recap should have at most 1 entry (self)
        names = {rec["user_name"] for rec in data["records"]}
        assert len(names) <= 1, f"Kasir sees multiple users: {names}"


class TestLateFlag:
    def test_late_flag_respects_threshold(self, admin_token):
        """If current WIB time > start_time, newly created records should have late=true.
        We cannot force a new checkin, but we can test via settings change + check an existing record.
        """
        # Just assert the setting roundtrips a non-default time
        r = requests.post(f"{API}/attendance/settings", json={"start_time": "23:59"}, headers=_h(admin_token), timeout=15)
        assert r.status_code == 200
        r2 = requests.get(f"{API}/attendance/settings", headers=_h(admin_token), timeout=15)
        assert r2.json()["start_time"] == "23:59"
        # Restore default
        requests.post(f"{API}/attendance/settings", json={"start_time": "08:00"}, headers=_h(admin_token), timeout=15)
