"""
Iter47 full-flow backend tests for Kasir, Penjualan Online, Laporan, Stok Opname.
Tests the review request: end-to-end flows for POS, Online sales, Reports, Stok Opname,
plus role-based access for kasir.
"""
import os
import pytest
import requests
from datetime import datetime
from pathlib import Path

def _load_backend_url():
    url = os.environ.get("REACT_APP_BACKEND_URL")
    if url:
        return url.rstrip("/")
    env = Path("/app/frontend/.env")
    if env.exists():
        for line in env.read_text().splitlines():
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip().rstrip("/")
    raise RuntimeError("REACT_APP_BACKEND_URL not set")

BASE_URL = _load_backend_url()
API = f"{BASE_URL}/api"

ADMIN = {"email": "nannsond@gmail.com", "password": "admin123"}
KASIR = {"email": "kasir@tokotani.com", "password": "kasir123"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN)


@pytest.fixture(scope="module")
def kasir_token():
    return _login(KASIR)


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def kasir_headers(kasir_token):
    return {"Authorization": f"Bearer {kasir_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def sample_products(admin_headers):
    r = requests.get(f"{API}/products", headers=admin_headers, timeout=15)
    assert r.status_code == 200
    prods = r.json()
    assert len(prods) > 0, "No seeded products"
    return prods


# ---------- Auth / Me ----------
class TestAuth:
    def test_me_admin(self, admin_headers):
        r = requests.get(f"{API}/auth/me", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        assert r.json()["role"] == "admin"

    def test_me_kasir(self, kasir_headers):
        r = requests.get(f"{API}/auth/me", headers=kasir_headers, timeout=15)
        assert r.status_code == 200
        assert r.json()["role"] == "kasir"


# ---------- Kasir POS flow ----------
class TestPOS:
    def test_pos_tunai_reduces_stock(self, admin_headers, sample_products):
        p = sample_products[0]
        before = p["stok"]
        payload = {
            "items": [{"product_id": p["id"], "name": p["name"], "qty": 1, "harga": p["harga_jual"], "is_bundle": False}],
            "discount": 0, "ongkir": 0,
            "payment_method": "Tunai",
            "customer_name": "TEST_POS",
            "alamat": "", "telepon": "",
        }
        r = requests.post(f"{API}/transactions", headers=admin_headers, json=payload, timeout=20)
        assert r.status_code == 200, r.text
        tx = r.json()
        assert tx["status"] == "lunas"
        assert tx["total"] == p["harga_jual"]
        assert "invoice_no" in tx
        self.tid = tx["id"]
        # verify stock reduced
        r2 = requests.get(f"{API}/products", headers=admin_headers, timeout=15)
        p2 = next(x for x in r2.json() if x["id"] == p["id"])
        assert p2["stok"] == before - 1, f"stock should decrease by 1 ({before} -> {p2['stok']})"
        # cleanup: delete tx (restores stock)
        requests.delete(f"{API}/transactions/{tx['id']}", headers=admin_headers, timeout=15)

    def test_pos_transfer_payment(self, admin_headers, sample_products):
        p = sample_products[1]
        payload = {
            "items": [{"product_id": p["id"], "name": p["name"], "qty": 2, "harga": p["harga_jual"], "is_bundle": False}],
            "discount": 0, "ongkir": 0, "payment_method": "Transfer",
            "customer_name": "TEST_POS_TRF", "alamat": "", "telepon": "",
        }
        r = requests.post(f"{API}/transactions", headers=admin_headers, json=payload, timeout=20)
        assert r.status_code == 200
        tid = r.json()["id"]
        requests.delete(f"{API}/transactions/{tid}", headers=admin_headers, timeout=15)

    def test_pos_empty_cart_rejected(self, admin_headers):
        r = requests.post(f"{API}/transactions", headers=admin_headers,
                          json={"items": [], "discount": 0, "ongkir": 0, "payment_method": "Tunai"}, timeout=15)
        assert r.status_code == 400

    def test_transactions_list(self, admin_headers):
        r = requests.get(f"{API}/transactions", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_kasir_can_create_transaction(self, kasir_headers, sample_products):
        p = sample_products[0]
        payload = {
            "items": [{"product_id": p["id"], "name": p["name"], "qty": 1, "harga": p["harga_jual"], "is_bundle": False}],
            "discount": 0, "ongkir": 0, "payment_method": "QRIS",
            "customer_name": "TEST_KASIR", "alamat": "", "telepon": "",
        }
        r = requests.post(f"{API}/transactions", headers=kasir_headers, json=payload, timeout=20)
        assert r.status_code == 200, r.text
        tid = r.json()["id"]
        # admin cleanup
        admin_t = _login(ADMIN)
        requests.delete(f"{API}/transactions/{tid}",
                        headers={"Authorization": f"Bearer {admin_t}"}, timeout=15)


# ---------- Penjualan Online ----------
class TestEcommerce:
    def test_channels_list(self, admin_headers):
        r = requests.get(f"{API}/channels", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        names = [c["name"] for c in r.json()]
        assert len(names) > 0
        self.__class__._channel = names[0]

    def test_create_ecom_sale_reduces_stock(self, admin_headers, sample_products):
        p = sample_products[2]
        before = p["stok"]
        # fetch channel
        r0 = requests.get(f"{API}/channels", headers=admin_headers, timeout=15).json()
        channel = r0[0]["name"]
        payload = {
            "channel": channel,
            "items": [{"product_id": p["id"], "name": p["name"], "qty": 1, "harga": p["harga_jual"], "is_bundle": False}],
            "admin_fee": 1000, "fee_breakdown": [{"label": "admin", "amount": 1000}],
            "ongkir": 0, "biaya_lain": 0,
            "customer_name": "TEST_ECOM", "order_no": "TEST-ORD-1",
        }
        r = requests.post(f"{API}/ecommerce/sales", headers=admin_headers, json=payload, timeout=20)
        assert r.status_code == 200, r.text
        sale = r.json()
        assert sale["omzet"] == p["harga_jual"]
        assert sale["total_fee"] == 1000
        self.__class__._sid = sale["id"]
        # stock reduced
        r2 = requests.get(f"{API}/products", headers=admin_headers, timeout=15).json()
        p2 = next(x for x in r2 if x["id"] == p["id"])
        assert p2["stok"] == before - 1

    def test_list_ecom_sales(self, admin_headers):
        r = requests.get(f"{API}/ecommerce/sales?limit=50", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        assert any(s["id"] == self.__class__._sid for s in r.json())

    def test_update_status(self, admin_headers):
        r = requests.put(f"{API}/ecommerce/sales/{self.__class__._sid}/status",
                         headers=admin_headers, json={"status": "Dikirim", "restore_stock": False}, timeout=15)
        assert r.status_code == 200
        assert r.json()["status"] == "Dikirim"

    def test_delete_restores_stock(self, admin_headers, sample_products):
        p = sample_products[2]
        r_before = requests.get(f"{API}/products", headers=admin_headers, timeout=15).json()
        stok_before = next(x for x in r_before if x["id"] == p["id"])["stok"]
        r = requests.delete(f"{API}/ecommerce/sales/{self.__class__._sid}", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        r_after = requests.get(f"{API}/products", headers=admin_headers, timeout=15).json()
        stok_after = next(x for x in r_after if x["id"] == p["id"])["stok"]
        assert stok_after == stok_before + 1

    def test_kasir_cannot_delete_ecom(self, kasir_headers, admin_headers, sample_products):
        # Create one as admin
        p = sample_products[3]
        r0 = requests.get(f"{API}/channels", headers=admin_headers, timeout=15).json()
        payload = {"channel": r0[0]["name"],
                   "items": [{"product_id": p["id"], "name": p["name"], "qty": 1, "harga": p["harga_jual"], "is_bundle": False}],
                   "admin_fee": 0, "fee_breakdown": [], "ongkir": 0, "biaya_lain": 0,
                   "customer_name": "TEST", "order_no": ""}
        sid = requests.post(f"{API}/ecommerce/sales", headers=admin_headers, json=payload, timeout=20).json()["id"]
        r = requests.delete(f"{API}/ecommerce/sales/{sid}", headers=kasir_headers, timeout=15)
        assert r.status_code in (401, 403)
        # cleanup
        requests.delete(f"{API}/ecommerce/sales/{sid}", headers=admin_headers, timeout=15)


# ---------- Laporan ----------
class TestLaporan:
    def test_daily_report(self, admin_headers):
        today = datetime.utcnow().strftime("%Y-%m-%d")
        r = requests.get(f"{API}/reports/daily?date={today}", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "total_omzet" in data or "omzet" in data or isinstance(data, dict)

    def test_monthly_report(self, admin_headers):
        now = datetime.utcnow()
        r = requests.get(f"{API}/reports/monthly?year={now.year}&month={now.month}", headers=admin_headers, timeout=15)
        assert r.status_code == 200

    def test_yearly_report(self, admin_headers):
        year = datetime.utcnow().strftime("%Y")
        r = requests.get(f"{API}/reports/yearly?year={year}", headers=admin_headers, timeout=15)
        assert r.status_code == 200

    def test_ecommerce_report(self, admin_headers):
        now = datetime.utcnow()
        r = requests.get(f"{API}/ecommerce/reports?mode=bulanan&year={now.year}&month={now.month}", headers=admin_headers, timeout=15)
        assert r.status_code == 200

    def test_cash_report(self, admin_headers):
        month = datetime.utcnow().strftime("%Y-%m")
        r = requests.get(f"{API}/reports/cash?month={month}", headers=admin_headers, timeout=15)
        assert r.status_code == 200

    def test_dashboard(self, admin_headers):
        r = requests.get(f"{API}/dashboard", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), dict)


# ---------- Stok Opname ----------
class TestStokOpname:
    def test_opname_adjusts_stock(self, admin_headers, sample_products):
        p = sample_products[4]
        current = p["stok"]
        new_fisik = current + 3
        payload = {"product_id": p["id"], "stok_fisik": new_fisik,
                   "alasan": "Penyesuaian", "note": "TEST_OPNAME"}
        r = requests.post(f"{API}/stok-opname", headers=admin_headers, json=payload, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["selisih"] == 3
        self.__class__._oid = d["id"]
        # verify
        r2 = requests.get(f"{API}/products", headers=admin_headers, timeout=15).json()
        p2 = next(x for x in r2 if x["id"] == p["id"])
        assert p2["stok"] == new_fisik
        # reset back
        requests.post(f"{API}/stok-opname", headers=admin_headers, json={
            "product_id": p["id"], "stok_fisik": current, "alasan": "Penyesuaian", "note": "TEST_RESET"
        }, timeout=20)

    def test_opname_list(self, admin_headers):
        r = requests.get(f"{API}/stok-opname", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        ids = [x["id"] for x in r.json()]
        assert self.__class__._oid in ids

    def test_kasir_can_create_opname(self, kasir_headers, sample_products):
        p = sample_products[0]
        r = requests.get(f"{API}/products", headers=kasir_headers, timeout=15).json()
        cur = next(x for x in r if x["id"] == p["id"])["stok"]
        payload = {"product_id": p["id"], "stok_fisik": cur, "alasan": "Penyesuaian", "note": "TEST_KASIR_OPNAME"}
        r2 = requests.post(f"{API}/stok-opname", headers=kasir_headers, json=payload, timeout=20)
        assert r2.status_code == 200

    def test_kasir_cannot_delete_opname(self, kasir_headers):
        r = requests.delete(f"{API}/stok-opname/{self.__class__._oid}", headers=kasir_headers, timeout=15)
        assert r.status_code in (401, 403)


# ---------- Role-based access for Kasir ----------
class TestKasirRole:
    def test_kasir_cannot_create_product(self, kasir_headers):
        payload = {"name": "TEST_K", "sku": "TEST-K-1", "harga": 1000, "stok": 1, "kategori": "test"}
        r = requests.post(f"{API}/products", headers=kasir_headers, json=payload, timeout=15)
        assert r.status_code in (401, 403), f"Kasir should not create products, got {r.status_code}"

    def test_kasir_cannot_delete_product(self, kasir_headers, sample_products):
        p = sample_products[0]
        r = requests.delete(f"{API}/products/{p['id']}", headers=kasir_headers, timeout=15)
        assert r.status_code in (401, 403)

    def test_kasir_can_list_products(self, kasir_headers):
        r = requests.get(f"{API}/products", headers=kasir_headers, timeout=15)
        assert r.status_code == 200
