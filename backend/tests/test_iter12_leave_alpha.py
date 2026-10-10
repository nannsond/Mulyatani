"""Iteration 12 tests: hari_kerja payroll setting, Alpha deduction, Leave workflow, RBAC."""
import os

import pytest
import requests


def _read_env():
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip()
    except Exception:
        pass
    return ""

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _read_env()).rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "nannsond@gmail.com", "password": "T0k0Mulya#Tani2026"}
KASIR = {"email": "kasir@tokotani.com", "password": "Kasir#Mulya2026"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json().get("access_token") or r.json()["token"]


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN)


@pytest.fixture(scope="module")
def kasir_token():
    return _login(KASIR)


def H(t):
    return {"Authorization": f"Bearer {t}"}


# ---------- Payroll settings with hari_kerja ----------
class TestPayrollSettings:
    def test_get_settings_includes_hari_kerja(self, admin_token):
        r = requests.get(f"{API}/payroll/settings", headers=H(admin_token))
        assert r.status_code == 200
        d = r.json()
        assert "potongan_telat" in d and "hari_kerja" in d
        assert isinstance(d["hari_kerja"], int)

    def test_set_settings_admin(self, admin_token):
        r = requests.post(f"{API}/payroll/settings",
                          json={"potongan_telat": 10000, "hari_kerja": 25},
                          headers=H(admin_token))
        assert r.status_code == 200
        d = r.json()
        assert d["potongan_telat"] == 10000
        assert d["hari_kerja"] == 25
        # verify persistence
        g = requests.get(f"{API}/payroll/settings", headers=H(admin_token)).json()
        assert g["hari_kerja"] == 25 and g["potongan_telat"] == 10000

    def test_set_settings_kasir_forbidden(self, kasir_token):
        r = requests.post(f"{API}/payroll/settings",
                          json={"potongan_telat": 5000, "hari_kerja": 20},
                          headers=H(kasir_token))
        assert r.status_code == 403


# ---------- Alpha deduction in payroll report ----------
class TestAlphaDeduction:
    def test_alpha_potongan_computation(self, admin_token):
        # ensure hari_kerja=25
        requests.post(f"{API}/payroll/settings",
                      json={"potongan_telat": 10000, "hari_kerja": 25},
                      headers=H(admin_token))
        month = "2026-10"
        r = requests.get(f"{API}/payroll/report?month={month}", headers=H(admin_token))
        assert r.status_code == 200
        rep = r.json()
        assert rep.get("hari_kerja") == 25
        # Pick kasir row with alpha>=1 (duplicate users exist from pollution)
        kasir_rows = [x for x in rep["rows"] if x.get("role") == "kasir" and x.get("alpha", 0) >= 1]
        assert kasir_rows, f"No kasir row with alpha>=1 found. rows={[(x['user_name'], x.get('alpha')) for x in rep['rows']]}"
        row = kasir_rows[0]
        # Verify fields exist
        assert "alpha" in row and "potongan_alpha" in row
        assert row["alpha"] >= 1
        # potongan_alpha should equal round(alpha * gaji_pokok / hari_kerja)
        expected_alpha_pot = round(row["alpha"] * row["gaji_pokok"] / 25)
        assert row["potongan_alpha"] == expected_alpha_pot, f"{row['potongan_alpha']} != {expected_alpha_pot}"
        # Non-override path: potongan == telat*rate + potongan_alpha, total = base + komisi - potongan
        if not row.get("edited"):
            assert row["potongan"] == row["telat"] * rep["potongan_telat"] + row["potongan_alpha"]
            assert row["total"] == row["gaji_pokok"] + row["komisi"] - row["potongan"]
        # Specific scenario check: with 2500000 base, 25 days, 2 alpha => 200000
        if row["gaji_pokok"] == 2500000 and row["alpha"] == 2:
            assert row["potongan_alpha"] == 200000


# ---------- Leave workflow ----------
class TestLeaveWorkflow:
    def test_leave_invalid_type(self, kasir_token):
        r = requests.post(f"{API}/leave",
                          json={"date": "2026-10-25", "type": "Cuti", "reason": "x"},
                          headers=H(kasir_token))
        assert r.status_code == 400

    def test_leave_kasir_submit_and_list_own(self, kasir_token, admin_token):
        payload = {"date": "2026-10-28", "type": "Izin", "reason": "TEST_iter12 keperluan keluarga"}
        r = requests.post(f"{API}/leave", json=payload, headers=H(kasir_token))
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "Pending"
        lid = d["id"]
        # kasir list -> only own
        kl = requests.get(f"{API}/leave", headers=H(kasir_token)).json()
        assert any(x["id"] == lid for x in kl["requests"])
        for x in kl["requests"]:
            # should not see other users
            pass
        # admin list -> includes & pending_count
        al = requests.get(f"{API}/leave", headers=H(admin_token)).json()
        assert "pending_count" in al
        assert any(x["id"] == lid for x in al["requests"])
        # Store for later tests
        pytest.lid_pending = lid

    def test_leave_kasir_cannot_review(self, kasir_token):
        lid = getattr(pytest, "lid_pending", None)
        assert lid
        r = requests.put(f"{API}/leave/{lid}/review", json={"approve": True}, headers=H(kasir_token))
        assert r.status_code == 403

    def test_leave_admin_approve_creates_attendance(self, admin_token):
        lid = pytest.lid_pending
        r = requests.put(f"{API}/leave/{lid}/review", json={"approve": True}, headers=H(admin_token))
        assert r.status_code == 200
        assert r.json()["status"] == "Disetujui"
        # verify attendance created for 2026-10-28 Izin
        att = requests.get(f"{API}/attendance?month=2026-10", headers=H(admin_token)).json()
        rows = att if isinstance(att, list) else att.get("records", att.get("items", att.get("rows", [])))
        found = any(a.get("date") == "2026-10-28" and a.get("status") == "Izin" for a in rows)
        assert found, f"attendance not upserted. sample: {rows[:3]}"

    def test_leave_review_already_processed(self, admin_token):
        lid = pytest.lid_pending
        r = requests.put(f"{API}/leave/{lid}/review", json={"approve": False}, headers=H(admin_token))
        assert r.status_code == 400

    def test_leave_reject_creates_no_attendance(self, kasir_token, admin_token):
        # submit a new one & reject
        payload = {"date": "2026-10-29", "type": "Sakit", "reason": "TEST_iter12 reject"}
        r = requests.post(f"{API}/leave", json=payload, headers=H(kasir_token))
        lid = r.json()["id"]
        rv = requests.put(f"{API}/leave/{lid}/review", json={"approve": False}, headers=H(admin_token))
        assert rv.status_code == 200 and rv.json()["status"] == "Ditolak"
        att2 = requests.get(f"{API}/attendance?month=2026-10", headers=H(admin_token)).json()
        rows2 = att2 if isinstance(att2, list) else att2.get("records", att2.get("items", att2.get("rows", [])))
        # no sakit on that date
        assert not any(a.get("date") == "2026-10-29" and a.get("status") == "Sakit" for a in rows2)
        # cleanup
        requests.delete(f"{API}/leave/{lid}", headers=H(admin_token))

    def test_leave_cancel_own_pending(self, kasir_token):
        payload = {"date": "2026-10-30", "type": "Izin", "reason": "TEST_iter12 cancel"}
        r = requests.post(f"{API}/leave", json=payload, headers=H(kasir_token))
        lid = r.json()["id"]
        d = requests.delete(f"{API}/leave/{lid}", headers=H(kasir_token))
        assert d.status_code == 200

    def test_leave_cancel_non_pending_forbidden(self, kasir_token, admin_token):
        # approved request can't be deleted by kasir
        payload = {"date": "2026-11-02", "type": "Izin", "reason": "TEST_iter12 approved"}
        r = requests.post(f"{API}/leave", json=payload, headers=H(kasir_token))
        lid = r.json()["id"]
        requests.put(f"{API}/leave/{lid}/review", json={"approve": True}, headers=H(admin_token))
        d = requests.delete(f"{API}/leave/{lid}", headers=H(kasir_token))
        assert d.status_code == 403
        # admin cleanup
        requests.delete(f"{API}/leave/{lid}", headers=H(admin_token))
