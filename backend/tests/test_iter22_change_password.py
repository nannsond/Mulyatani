"""Iteration 22 - Change Password feature tests."""
import os
import subprocess
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # fallback: read from frontend/.env
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")

ADMIN_EMAIL = "nannsond@gmail.com"
ADMIN_PASS = "admin123"
NEW_PASS = "newAdmin456"


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password})
    return r


@pytest.fixture(scope="module")
def admin_token():
    r = _login(ADMIN_EMAIL, ADMIN_PASS)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module", autouse=True)
def restore_admin_password_at_end():
    """Ensures admin password is admin123 at end of module no matter what."""
    yield
    # Try login with current credentials
    for pw_try in [ADMIN_PASS, NEW_PASS]:
        r = _login(ADMIN_EMAIL, pw_try)
        if r.status_code == 200:
            token = r.json()["token"]
            if pw_try != ADMIN_PASS:
                requests.post(
                    f"{BASE_URL}/api/auth/change-password",
                    headers={"Authorization": f"Bearer {token}"},
                    json={"current_password": pw_try, "new_password": ADMIN_PASS},
                )
            break
    # Final verification
    assert _login(ADMIN_EMAIL, ADMIN_PASS).status_code == 200, "FAILED TO RESTORE ADMIN PASSWORD"


class TestChangePasswordValidation:
    def test_no_token_401(self):
        r = requests.post(f"{BASE_URL}/api/auth/change-password",
                          json={"current_password": "x", "new_password": "yyyyyy"})
        assert r.status_code in (401, 403)

    def test_wrong_current_400(self, admin_token):
        r = requests.post(f"{BASE_URL}/api/auth/change-password",
                          headers={"Authorization": f"Bearer {admin_token}"},
                          json={"current_password": "wrongpass", "new_password": "abcdef1"})
        assert r.status_code == 400
        assert "Password lama salah" in r.json().get("detail", "")

    def test_new_password_too_short_400(self, admin_token):
        r = requests.post(f"{BASE_URL}/api/auth/change-password",
                          headers={"Authorization": f"Bearer {admin_token}"},
                          json={"current_password": ADMIN_PASS, "new_password": "abc"})
        assert r.status_code == 400
        assert "minimal 6" in r.json().get("detail", "")

    def test_same_as_old_400(self, admin_token):
        r = requests.post(f"{BASE_URL}/api/auth/change-password",
                          headers={"Authorization": f"Bearer {admin_token}"},
                          json={"current_password": ADMIN_PASS, "new_password": ADMIN_PASS})
        assert r.status_code == 400
        assert "berbeda" in r.json().get("detail", "")


class TestChangePasswordFlowAdmin:
    def test_success_and_relogin_and_restart_persistence(self, admin_token):
        # Change password
        r = requests.post(f"{BASE_URL}/api/auth/change-password",
                          headers={"Authorization": f"Bearer {admin_token}"},
                          json={"current_password": ADMIN_PASS, "new_password": NEW_PASS})
        assert r.status_code == 200
        assert r.json().get("ok") is True

        # Old password login should fail
        r_old = _login(ADMIN_EMAIL, ADMIN_PASS)
        assert r_old.status_code == 401

        # New password login should succeed
        r_new = _login(ADMIN_EMAIL, NEW_PASS)
        assert r_new.status_code == 200

        # Restart backend and verify new password still works (seed_admin should NOT reset)
        subprocess.run(["sudo", "supervisorctl", "restart", "backend"], check=True, capture_output=True)
        # wait for backend to come back
        for _ in range(30):
            time.sleep(1)
            try:
                h = requests.get(f"{BASE_URL}/api/auth/login", timeout=2)
                if h.status_code in (200, 405, 422):
                    break
            except Exception:
                continue

        r_old2 = _login(ADMIN_EMAIL, ADMIN_PASS)
        assert r_old2.status_code == 401, "Backend restart reverted admin password!"
        r_new2 = _login(ADMIN_EMAIL, NEW_PASS)
        assert r_new2.status_code == 200, "New password invalid after restart"

        # Restore
        token2 = r_new2.json()["token"]
        r_restore = requests.post(f"{BASE_URL}/api/auth/change-password",
                                  headers={"Authorization": f"Bearer {token2}"},
                                  json={"current_password": NEW_PASS, "new_password": ADMIN_PASS})
        assert r_restore.status_code == 200
        assert _login(ADMIN_EMAIL, ADMIN_PASS).status_code == 200


class TestChangePasswordKasir:
    def test_kasir_can_change_own_password(self, admin_token):
        kasir_email = "test_iter22_kasir@example.com"
        kasir_pw = "kasir123"
        kasir_new_pw = "kasirNew9"

        # Create kasir via admin
        r = requests.post(f"{BASE_URL}/api/users",
                          headers={"Authorization": f"Bearer {admin_token}"},
                          json={"email": kasir_email, "password": kasir_pw,
                                "name": "TEST_Iter22_Kasir", "role": "kasir"})
        assert r.status_code in (200, 201), f"Create kasir failed: {r.status_code} {r.text}"
        kasir_id = r.json().get("id") or r.json().get("_id")

        try:
            # Login as kasir
            rk = _login(kasir_email, kasir_pw)
            assert rk.status_code == 200
            kasir_token = rk.json()["token"]

            # Change password
            rc = requests.post(f"{BASE_URL}/api/auth/change-password",
                               headers={"Authorization": f"Bearer {kasir_token}"},
                               json={"current_password": kasir_pw, "new_password": kasir_new_pw})
            assert rc.status_code == 200

            # Old fails, new works
            assert _login(kasir_email, kasir_pw).status_code == 401
            assert _login(kasir_email, kasir_new_pw).status_code == 200
        finally:
            # Cleanup
            if kasir_id:
                requests.delete(f"{BASE_URL}/api/users/{kasir_id}",
                                headers={"Authorization": f"Bearer {admin_token}"})
