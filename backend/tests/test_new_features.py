"""Backend tests for iteration 2 new features: Kelola Kasir, Target, Laba, Role restriction."""
import os
import time

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://mulyatani-preview.preview.emergentagent.com").rstrip("/")
ADMIN = {"email": "nannsond@gmail.com", "password": "admin123"}
KASIR = {"email": "kasir@tokotani.com", "password": "kasir123"}


def _login(creds):
    r = requests.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN)


@pytest.fixture(scope="module")
def kasir_token():
    return _login(KASIR)


@pytest.fixture
def admin_h(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture
def kasir_h(kasir_token):
    return {"Authorization": f"Bearer {kasir_token}"}


# ---------- Role restriction / Users CRUD ----------
class TestUsers:
    def test_kasir_forbidden_users(self, kasir_h):
        r = requests.get(f"{BASE_URL}/api/users", headers=kasir_h)
        assert r.status_code == 403

    def test_admin_list_users(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/users", headers=admin_h)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert any(u["email"] == ADMIN["email"] for u in data)
        for u in data:
            assert "id" in u and "email" in u and "role" in u

    def test_user_crud_flow(self, admin_h):
        email = f"test_user_{int(time.time())}@tokotani.com"
        # Create
        r = requests.post(f"{BASE_URL}/api/users", headers=admin_h,
                          json={"email": email, "password": "pass1234", "name": "Test Kasir", "role": "kasir"})
        assert r.status_code == 200, r.text
        uid = r.json()["id"]
        assert r.json()["email"] == email

        # Verify via list
        r2 = requests.get(f"{BASE_URL}/api/users", headers=admin_h)
        assert any(u["id"] == uid for u in r2.json())

        # Update
        r3 = requests.put(f"{BASE_URL}/api/users/{uid}", headers=admin_h,
                          json={"email": email, "password": "", "name": "Updated Name", "role": "kasir"})
        assert r3.status_code == 200
        r4 = requests.get(f"{BASE_URL}/api/users", headers=admin_h)
        updated = next(u for u in r4.json() if u["id"] == uid)
        assert updated["name"] == "Updated Name"

        # Delete
        r5 = requests.delete(f"{BASE_URL}/api/users/{uid}", headers=admin_h)
        assert r5.status_code == 200
        r6 = requests.get(f"{BASE_URL}/api/users", headers=admin_h)
        assert not any(u["id"] == uid for u in r6.json())

    def test_duplicate_email(self, admin_h):
        r = requests.post(f"{BASE_URL}/api/users", headers=admin_h,
                          json={"email": ADMIN["email"], "password": "x", "name": "x", "role": "kasir"})
        assert r.status_code == 400

    def test_kasir_cannot_create_user(self, kasir_h):
        r = requests.post(f"{BASE_URL}/api/users", headers=kasir_h,
                          json={"email": "no@no.com", "password": "x", "name": "x", "role": "kasir"})
        assert r.status_code == 403


# ---------- Laba Kotor in reports ----------
class TestLaba:
    def test_daily_has_total_laba(self, admin_h):
        from datetime import datetime
        today = datetime.utcnow().strftime("%Y-%m-%d")
        r = requests.get(f"{BASE_URL}/api/reports/daily?date={today}", headers=admin_h)
        assert r.status_code == 200
        assert "total_laba" in r.json()["summary"]
        assert isinstance(r.json()["summary"]["total_laba"], (int, float))

    def test_monthly_has_total_laba_and_target(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/reports/monthly?year=2026&month=10", headers=admin_h)
        assert r.status_code == 200
        data = r.json()
        assert "total_laba" in data["summary"]
        assert "target_omzet" in data
        assert isinstance(data["target_omzet"], (int, float))

    def test_yearly_has_total_laba(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/reports/yearly?year=2026", headers=admin_h)
        assert r.status_code == 200
        assert "total_laba" in r.json()["summary"]


# ---------- Targets ----------
class TestTargets:
    def test_set_and_get_target_admin(self, admin_h):
        payload = {"year": 2026, "month": 11, "target_omzet": 5000000}
        r = requests.post(f"{BASE_URL}/api/targets", headers=admin_h, json=payload)
        assert r.status_code == 200
        r2 = requests.get(f"{BASE_URL}/api/targets?year=2026&month=11", headers=admin_h)
        assert r2.status_code == 200
        assert r2.json()["target_omzet"] == 5000000
        # Monthly report should also reflect it
        r3 = requests.get(f"{BASE_URL}/api/reports/monthly?year=2026&month=11", headers=admin_h)
        assert r3.json()["target_omzet"] == 5000000

    def test_kasir_cannot_set_target(self, kasir_h):
        r = requests.post(f"{BASE_URL}/api/targets", headers=kasir_h,
                          json={"year": 2026, "month": 11, "target_omzet": 1})
        assert r.status_code == 403

    def test_kasir_can_read_target(self, kasir_h):
        r = requests.get(f"{BASE_URL}/api/targets?year=2026&month=11", headers=kasir_h)
        assert r.status_code == 200
