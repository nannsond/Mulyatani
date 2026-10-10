"""Iter 11 tests: payroll archive + attendance status (Hadir/Izin/Sakit/Alpha + admin mark)."""
import os

import pytest
import requests


def _load_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if not v:
        try:
            with open("/app/frontend/.env") as f:
                for ln in f:
                    if ln.startswith("REACT_APP_BACKEND_URL"):
                        v = ln.split("=", 1)[1].strip()
                        break
        except Exception:
            pass
    return v.rstrip("/")

BASE_URL = _load_url()
API = f"{BASE_URL}/api"
ADMIN = {"email": "nannsond@gmail.com", "password": "T0k0Mulya#Tani2026"}
KASIR = {"email": "kasir@tokotani.com", "password": "Kasir#Mulya2026"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_h():
    return {"Authorization": f"Bearer {_login(ADMIN)}"}


@pytest.fixture(scope="module")
def kasir_h():
    return {"Authorization": f"Bearer {_login(KASIR)}"}


@pytest.fixture(scope="module")
def me_kasir(kasir_h):
    r = requests.get(f"{API}/auth/me", headers=kasir_h, timeout=10)
    assert r.status_code == 200
    return r.json()


MONTH = "2026-10"


# ---------- Payroll archive ----------
class TestPayrollArchive:
    def test_archive_admin(self, admin_h):
        r = requests.post(f"{API}/payroll/archive", json={"month": MONTH}, headers=admin_h, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("ok") is True
        assert isinstance(data.get("archived"), int)
        assert data["archived"] >= 1

    def test_archive_kasir_forbidden(self, kasir_h):
        r = requests.post(f"{API}/payroll/archive", json={"month": MONTH}, headers=kasir_h, timeout=15)
        assert r.status_code == 403

    def test_archives_list(self, admin_h):
        r = requests.get(f"{API}/payroll/archives", headers=admin_h, timeout=15)
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list) and len(rows) >= 1
        for row in rows:
            assert "month" in row and "total" in row and "count" in row
        # sorted desc
        months = [r["month"] for r in rows]
        assert months == sorted(months, reverse=True)
        # our MONTH is present
        assert any(x["month"] == MONTH for x in rows)

    def test_archives_kasir_forbidden(self, kasir_h):
        r = requests.get(f"{API}/payroll/archives", headers=kasir_h, timeout=15)
        assert r.status_code == 403

    def test_report_shows_archived_edited(self, admin_h):
        r = requests.get(f"{API}/payroll/report?month={MONTH}", headers=admin_h, timeout=15)
        assert r.status_code == 200
        rows = r.json()["rows"]
        assert len(rows) >= 1
        assert all(row["edited"] is True for row in rows), "After archive, all rows should be edited=True"


# ---------- Attendance mark ----------
class TestAttendanceMark:
    def test_admin_mark_other_izin(self, admin_h, me_kasir):
        # mark kasir Izin on a non-conflicting date
        date = "2026-10-15"
        r = requests.post(f"{API}/attendance/mark",
                          json={"user_id": me_kasir["id"], "date": date, "status": "Izin"},
                          headers=admin_h, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("status") == "Izin"

    def test_kasir_mark_other_forbidden(self, kasir_h, admin_h):
        # kasir trying to mark admin
        rme = requests.get(f"{API}/auth/me", headers=admin_h).json()
        r = requests.post(f"{API}/attendance/mark",
                          json={"user_id": rme["id"], "date": "2026-10-16", "status": "Izin"},
                          headers=kasir_h, timeout=15)
        assert r.status_code == 403

    def test_kasir_mark_self_allowed(self, kasir_h):
        r = requests.post(f"{API}/attendance/mark",
                          json={"date": "2026-10-17", "status": "Sakit"},
                          headers=kasir_h, timeout=15)
        assert r.status_code == 200
        assert r.json().get("status") == "Sakit"

    def test_invalid_status(self, admin_h):
        r = requests.post(f"{API}/attendance/mark",
                          json={"date": "2026-10-18", "status": "Bolos"},
                          headers=admin_h, timeout=15)
        assert r.status_code == 400

    def test_mark_izin_clears_times(self, admin_h, kasir_h, me_kasir):
        date = "2026-10-19"
        requests.post(f"{API}/attendance/mark",
                      json={"user_id": me_kasir["id"], "date": date, "status": "Izin"},
                      headers=admin_h, timeout=15)
        r = requests.get(f"{API}/attendance?month={MONTH}", headers=admin_h, timeout=15)
        assert r.status_code == 200
        rec = next((d for d in r.json()["records"] if d["date"] == date and d["user_id"] == me_kasir["id"]), None)
        assert rec is not None
        assert rec.get("status") == "Izin"
        assert rec.get("check_in") in (None, "")
        assert rec.get("check_out") in (None, "")


# ---------- Attendance recap ----------
class TestAttendanceRecap:
    def test_recap_fields(self, admin_h):
        r = requests.get(f"{API}/attendance?month={MONTH}", headers=admin_h, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "recap" in data and "records" in data
        assert len(data["recap"]) >= 1
        for e in data["recap"]:
            for k in ("hadir", "telat", "izin", "sakit", "alpha", "total_menit", "user_name"):
                assert k in e, f"Missing recap field {k}"

    def test_izin_sakit_not_counted_as_hadir(self, admin_h, me_kasir):
        r = requests.get(f"{API}/attendance?month={MONTH}", headers=admin_h, timeout=15)
        data = r.json()
        e = next((x for x in data["recap"] if x["user_name"] == me_kasir["name"]), None)
        assert e is not None
        # We've added Izin + Sakit for the kasir; at least sakit>=1 and izin>=1
        assert e["izin"] >= 1
        assert e["sakit"] >= 1


# ---------- Payroll gating ----------
class TestPayrollStatusGating:
    def test_payroll_hadir_matches_recap(self, admin_h):
        att = requests.get(f"{API}/attendance?month={MONTH}", headers=admin_h, timeout=15).json()
        rep = requests.get(f"{API}/payroll/report?month={MONTH}", headers=admin_h, timeout=15).json()["rows"]
        # Count Hadir records per user_id directly (robust to duplicate names)
        hadir_by_uid = {}
        telat_by_uid = {}
        for d in att["records"]:
            if d.get("status", "Hadir") == "Hadir":
                hadir_by_uid[d["user_id"]] = hadir_by_uid.get(d["user_id"], 0) + 1
                if d.get("late"):
                    telat_by_uid[d["user_id"]] = telat_by_uid.get(d["user_id"], 0) + 1
        for row in rep:
            assert row["hadir"] == hadir_by_uid.get(row["user_id"], 0), (
                f"{row['user_name']} ({row['user_id']}): payroll hadir {row['hadir']} "
                f"vs expected {hadir_by_uid.get(row['user_id'], 0)}"
            )
            assert row["telat"] == telat_by_uid.get(row["user_id"], 0)
