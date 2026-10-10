"""Security audit verification tests (SEC-001 to SEC-005 + ObjectId hardening + regression)."""
import os
import time

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://mulyatani-preview.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "nannsond@gmail.com"
ADMIN_PWD = "T0k0Mulya#Tani2026"
KASIR_EMAIL = "kasir@tokotani.com"
KASIR_PWD = "Kasir#Mulya2026"


# ---------- fixtures ----------
@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PWD}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def kasir_token():
    r = requests.post(f"{API}/auth/login", json={"email": KASIR_EMAIL, "password": KASIR_PWD}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["token"]


def hdr(tok):
    return {"Authorization": f"Bearer {tok}"}


# ---------- SEC-002: old creds must fail ----------
class TestOldCreds:
    def test_old_weak_admin_pwd_rejected(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "admin123"}, timeout=20)
        assert r.status_code == 401

    def test_new_admin_login_ok(self, admin_token):
        assert admin_token


# ---------- SEC-001: register ignores role ----------
class TestRegisterRoleIgnored:
    def test_register_with_admin_role_becomes_kasir(self):
        email = f"TEST_sec001_{int(time.time())}@test.com"
        r = requests.post(f"{API}/auth/register", json={
            "email": email, "password": "StrongPwd#2026", "name": "Sec Test", "role": "admin"
        }, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["user"]["role"] == "kasir"
        tok = data["token"]
        # Confirm token cannot access admin endpoints
        r2 = requests.get(f"{API}/users", headers=hdr(tok), timeout=20)
        assert r2.status_code == 403


# ---------- SEC-003: RBAC ----------
class TestRBACKasirForbidden:
    def test_kasir_cannot_create_product(self, kasir_token):
        r = requests.post(f"{API}/products", headers=hdr(kasir_token), json={
            "sku": "TEST_SEC_SKU", "name": "x", "category": "y"
        }, timeout=20)
        assert r.status_code == 403

    def test_kasir_cannot_update_product(self, kasir_token, admin_token):
        prods = requests.get(f"{API}/products", headers=hdr(admin_token), timeout=20).json()
        pid = prods[0]["id"]
        r = requests.put(f"{API}/products/{pid}", headers=hdr(kasir_token), json={
            "sku": prods[0]["sku"], "name": prods[0]["name"], "category": prods[0]["category"]
        }, timeout=20)
        assert r.status_code == 403

    def test_kasir_cannot_delete_product(self, kasir_token, admin_token):
        prods = requests.get(f"{API}/products", headers=hdr(admin_token), timeout=20).json()
        pid = prods[0]["id"]
        r = requests.delete(f"{API}/products/{pid}", headers=hdr(kasir_token), timeout=20)
        assert r.status_code == 403

    def test_kasir_cannot_create_purchase(self, kasir_token):
        r = requests.post(f"{API}/purchases", headers=hdr(kasir_token), json={
            "supplier": "x", "items": []
        }, timeout=20)
        assert r.status_code == 403

    def test_kasir_cannot_create_expense(self, kasir_token):
        r = requests.post(f"{API}/expenses", headers=hdr(kasir_token), json={
            "category": "x", "amount": 1
        }, timeout=20)
        assert r.status_code == 403

    def test_kasir_cannot_delete_expense(self, kasir_token):
        r = requests.delete(f"{API}/expenses/507f1f77bcf86cd799439011", headers=hdr(kasir_token), timeout=20)
        assert r.status_code == 403

    def test_kasir_cannot_set_store_info(self, kasir_token):
        r = requests.post(f"{API}/settings/info", headers=hdr(kasir_token), json={"store_name": "x"}, timeout=20)
        assert r.status_code == 403

    def test_kasir_cannot_upload_logo(self, kasir_token):
        files = {"file": ("x.png", b"notapng", "image/png")}
        r = requests.post(f"{API}/settings/logo", headers=hdr(kasir_token), files=files, timeout=20)
        assert r.status_code == 403

    def test_kasir_cannot_list_users(self, kasir_token):
        r = requests.get(f"{API}/users", headers=hdr(kasir_token), timeout=20)
        assert r.status_code == 403

    def test_kasir_cannot_create_user(self, kasir_token):
        r = requests.post(f"{API}/users", headers=hdr(kasir_token), json={
            "email": "x@y.z", "password": "p", "name": "n"
        }, timeout=20)
        assert r.status_code == 403


class TestRBACKasirAllowed:
    def test_kasir_can_list_products(self, kasir_token):
        r = requests.get(f"{API}/products", headers=hdr(kasir_token), timeout=20)
        assert r.status_code == 200

    def test_kasir_can_create_transaction(self, kasir_token):
        prods = requests.get(f"{API}/products", headers=hdr(kasir_token), timeout=20).json()
        p = prods[0]
        r = requests.post(f"{API}/transactions", headers=hdr(kasir_token), json={
            "items": [{"product_id": p["id"], "name": p["name"], "qty": 1, "harga": p["harga_jual"]}],
            "payment_method": "Tunai"
        }, timeout=20)
        assert r.status_code == 200
        tid = r.json()["id"]
        # pay transaction
        r2 = requests.post(f"{API}/transactions/{tid}/pay", headers=hdr(kasir_token), json={"amount": 1}, timeout=20)
        assert r2.status_code == 200

    def test_kasir_can_stok_opname(self, kasir_token):
        prods = requests.get(f"{API}/products", headers=hdr(kasir_token), timeout=20).json()
        p = prods[0]
        r = requests.post(f"{API}/stok-opname", headers=hdr(kasir_token), json={
            "product_id": p["id"], "stok_fisik": p["stok"], "alasan": "Test"
        }, timeout=20)
        assert r.status_code == 200

    def test_kasir_can_read_reports(self, kasir_token):
        from datetime import datetime
        today = datetime.utcnow().strftime("%Y-%m-%d")
        r = requests.get(f"{API}/reports/daily?date={today}", headers=hdr(kasir_token), timeout=20)
        assert r.status_code == 200

    def test_kasir_can_read_piutang_hutang(self, kasir_token):
        assert requests.get(f"{API}/piutang", headers=hdr(kasir_token), timeout=20).status_code == 200
        assert requests.get(f"{API}/hutang", headers=hdr(kasir_token), timeout=20).status_code == 200


class TestRBACAdminAllowed:
    def test_admin_can_list_users(self, admin_token):
        r = requests.get(f"{API}/users", headers=hdr(admin_token), timeout=20)
        assert r.status_code == 200

    def test_admin_full_crud_product(self, admin_token):
        sku = f"TEST_SEC_{int(time.time())}"
        r = requests.post(f"{API}/products", headers=hdr(admin_token), json={
            "sku": sku, "name": "Test Prod", "category": "Pupuk", "harga_jual": 100, "harga_beli": 50
        }, timeout=20)
        assert r.status_code == 200, r.text
        pid = r.json()["id"]
        r = requests.put(f"{API}/products/{pid}", headers=hdr(admin_token), json={
            "sku": sku, "name": "Test Prod Updated", "category": "Pupuk", "harga_jual": 200, "harga_beli": 50
        }, timeout=20)
        assert r.status_code == 200
        assert r.json()["name"] == "Test Prod Updated"
        r = requests.delete(f"{API}/products/{pid}", headers=hdr(admin_token), timeout=20)
        assert r.status_code == 200


# ---------- SEC-004: regex injection / ReDoS ----------
class TestRegexEscape:
    @pytest.mark.parametrize("q", ["(", ".*", "[", "^$", "(.+)+"])
    def test_transactions_q_safe(self, admin_token, q):
        t0 = time.time()
        r = requests.get(f"{API}/transactions", params={"q": q}, headers=hdr(admin_token), timeout=10)
        assert r.status_code == 200
        assert time.time() - t0 < 5

    @pytest.mark.parametrize("d", ["(", ".*", "2025-01"])
    def test_reports_daily_safe(self, admin_token, d):
        t0 = time.time()
        r = requests.get(f"{API}/reports/daily", params={"date": d}, headers=hdr(admin_token), timeout=10)
        assert r.status_code == 200
        assert time.time() - t0 < 5

    def test_purchases_month_safe(self, admin_token):
        r = requests.get(f"{API}/purchases", params={"month": "(.+)+"}, headers=hdr(admin_token), timeout=10)
        assert r.status_code == 200

    def test_expenses_month_safe(self, admin_token):
        r = requests.get(f"{API}/expenses", params={"month": "(.+)+"}, headers=hdr(admin_token), timeout=10)
        assert r.status_code == 200


# ---------- SEC-005: logo magic bytes ----------
class TestLogoUpload:
    def test_reject_fake_png(self, admin_token):
        files = {"file": ("evil.png", b"<html>not a png</html>", "image/png")}
        r = requests.post(f"{API}/settings/logo", headers=hdr(admin_token), files=files, timeout=30)
        assert r.status_code == 400
        assert "bukan gambar" in r.json()["detail"].lower()

    def test_accept_real_png(self, admin_token):
        # minimal 1x1 PNG
        png = bytes.fromhex(
            "89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C489"
            "0000000D49444154789C6300010000000500010D0A2DB40000000049454E44AE426082"
        )
        files = {"file": ("ok.png", png, "image/png")}
        r = requests.post(f"{API}/settings/logo", headers=hdr(admin_token), files=files, timeout=30)
        assert r.status_code == 200, r.text
        r2 = requests.get(f"{API}/settings/logo", timeout=20)
        assert r2.status_code == 200
        assert r2.headers.get("content-type", "").startswith("image/")


# ---------- ObjectId hardening ----------
class TestInvalidId:
    def test_put_product_invalid_id(self, admin_token):
        r = requests.put(f"{API}/products/not-an-id", headers=hdr(admin_token), json={
            "sku": "x", "name": "x", "category": "x"
        }, timeout=20)
        assert r.status_code == 400
        assert "tidak valid" in r.json()["detail"].lower()

    def test_pay_tx_invalid_id(self, kasir_token):
        r = requests.post(f"{API}/transactions/xxx/pay", headers=hdr(kasir_token), json={"amount": 1}, timeout=20)
        assert r.status_code == 400

    def test_delete_product_invalid_id(self, admin_token):
        r = requests.delete(f"{API}/products/not-an-id", headers=hdr(admin_token), timeout=20)
        assert r.status_code == 400


# ---------- Regression ----------
class TestRegression:
    def test_dashboard_loads(self, admin_token):
        r = requests.get(f"{API}/dashboard", headers=hdr(admin_token), timeout=20)
        assert r.status_code == 200
        assert "today" in r.json()

    def test_reports_monthly(self, admin_token):
        from datetime import datetime
        now = datetime.utcnow()
        r = requests.get(f"{API}/reports/monthly", params={"year": now.year, "month": now.month}, headers=hdr(admin_token), timeout=20)
        assert r.status_code == 200
