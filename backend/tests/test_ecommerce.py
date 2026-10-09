"""Tests for new Ecommerce sales feature (iteration 7)."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://agro-business-hub-3.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "nannsond@gmail.com"
ADMIN_PWD = "T0k0Mulya#Tani2026"
KASIR_EMAIL = "kasir@tokotani.com"
KASIR_PWD = "Kasir#Mulya2026"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PWD}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def kasir_token():
    r = requests.post(f"{API}/auth/login", json={"email": KASIR_EMAIL, "password": KASIR_PWD}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["token"]


def hdr(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def sample_product(admin_token):
    """Pick an existing product with stok > 5."""
    r = requests.get(f"{API}/products", headers=hdr(admin_token), timeout=20)
    assert r.status_code == 200
    prods = r.json()
    assert prods, "No products in DB"
    # pick a product with enough stock
    chosen = next((p for p in prods if p.get("stok", 0) >= 10), prods[0])
    return chosen


def get_product_stok(token, pid):
    r = requests.get(f"{API}/products", headers=hdr(token), timeout=20)
    for p in r.json():
        if p["id"] == pid:
            return p["stok"]
    return None


class TestEcomCreateAndStock:
    def test_create_ecom_sale_computes_fields_and_decrements_stock(self, admin_token, sample_product):
        pid = sample_product["id"]
        before_stok = sample_product["stok"]
        harga_beli = sample_product.get("harga_beli", 0)

        qty = 2
        harga = max(float(harga_beli) + 5000, 10000)
        admin_fee = 1500.0
        ongkir = 10000.0
        biaya_lain = 500.0
        payload = {
            "channel": "Shopee",
            "items": [{"product_id": pid, "name": sample_product["name"], "qty": qty, "harga": harga}],
            "admin_fee": admin_fee, "ongkir": ongkir, "biaya_lain": biaya_lain,
            "customer_name": "TEST_CUSTOMER", "order_no": "TEST-ORD-001",
        }
        r = requests.post(f"{API}/ecommerce/sales", json=payload, headers=hdr(admin_token), timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        omzet = qty * harga
        hpp = qty * harga_beli
        total_fee = admin_fee + ongkir + biaya_lain
        assert abs(data["omzet"] - omzet) < 0.01
        assert abs(data["hpp"] - hpp) < 0.01
        assert abs(data["laba_kotor"] - (omzet - hpp)) < 0.01
        assert abs(data["total_fee"] - total_fee) < 0.01
        assert abs(data["laba_bersih"] - (omzet - hpp - total_fee)) < 0.01
        assert data["channel"] == "Shopee"
        assert data["ecom_no"].startswith("ECOM-")
        assert "id" in data

        # verify stock decremented
        after_stok = get_product_stok(admin_token, pid)
        assert after_stok == before_stok - qty, f"stock not decremented: {before_stok}->{after_stok}"

        # save for later
        pytest.ecom_sale_id = data["id"]
        pytest.ecom_pid = pid
        pytest.ecom_qty = qty
        pytest.ecom_stok_after = after_stok

    def test_invalid_channel_returns_400(self, admin_token, sample_product):
        payload = {
            "channel": "Bukalapak",
            "items": [{"product_id": sample_product["id"], "name": sample_product["name"], "qty": 1, "harga": 10000}],
        }
        r = requests.post(f"{API}/ecommerce/sales", json=payload, headers=hdr(admin_token), timeout=20)
        assert r.status_code == 400

    def test_empty_items_returns_400(self, admin_token):
        r = requests.post(f"{API}/ecommerce/sales", json={"channel": "Shopee", "items": []}, headers=hdr(admin_token), timeout=20)
        assert r.status_code == 400


class TestEcomList:
    def test_list_shows_created_sale(self, admin_token):
        r = requests.get(f"{API}/ecommerce/sales", headers=hdr(admin_token), timeout=20)
        assert r.status_code == 200
        ids = [s["id"] for s in r.json()]
        assert pytest.ecom_sale_id in ids

    def test_list_filter_by_channel(self, admin_token):
        r = requests.get(f"{API}/ecommerce/sales?channel=Shopee", headers=hdr(admin_token), timeout=20)
        assert r.status_code == 200
        assert all(s["channel"] == "Shopee" for s in r.json())


class TestEcomReports:
    def test_report_bulanan_structure(self, admin_token):
        r = requests.get(f"{API}/ecommerce/reports?mode=bulanan", headers=hdr(admin_token), timeout=20)
        assert r.status_code == 200
        data = r.json()
        for k in ["mode", "periode", "summary", "channels", "series", "channel_names"]:
            assert k in data
        assert data["channel_names"] == ["Shopee", "Tokopedia", "Lazada", "TikTok Shop"]
        assert len(data["channels"]) >= 4
        for ch in data["channels"]:
            for k in ["omzet", "fee", "laba_kotor", "laba_bersih", "transaksi"]:
                assert k in ch

    def test_report_harian(self, admin_token):
        r = requests.get(f"{API}/ecommerce/reports?mode=harian", headers=hdr(admin_token), timeout=20)
        assert r.status_code == 200

    def test_report_tahunan(self, admin_token):
        r = requests.get(f"{API}/ecommerce/reports?mode=tahunan&year=2026", headers=hdr(admin_token), timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert d["periode"] == "Tahun 2026"


class TestEcomPermissionsAndDelete:
    def test_kasir_can_create(self, kasir_token, sample_product):
        payload = {
            "channel": "Tokopedia",
            "items": [{"product_id": sample_product["id"], "name": sample_product["name"], "qty": 1, "harga": 15000}],
            "admin_fee": 500, "ongkir": 8000, "biaya_lain": 0,
            "customer_name": "TEST_KASIR_CUST",
        }
        r = requests.post(f"{API}/ecommerce/sales", json=payload, headers=hdr(kasir_token), timeout=20)
        assert r.status_code == 200, r.text
        pytest.ecom_kasir_sale_id = r.json()["id"]

    def test_kasir_cannot_delete(self, kasir_token):
        r = requests.delete(f"{API}/ecommerce/sales/{pytest.ecom_kasir_sale_id}", headers=hdr(kasir_token), timeout=20)
        assert r.status_code == 403

    def test_admin_delete_restores_stock(self, admin_token):
        # delete first ecom sale and verify stock restored
        before_stok = get_product_stok(admin_token, pytest.ecom_pid)
        r = requests.delete(f"{API}/ecommerce/sales/{pytest.ecom_sale_id}", headers=hdr(admin_token), timeout=20)
        assert r.status_code == 200
        after_stok = get_product_stok(admin_token, pytest.ecom_pid)
        assert after_stok == before_stok + pytest.ecom_qty

    def test_cleanup_kasir_sale(self, admin_token):
        r = requests.delete(f"{API}/ecommerce/sales/{pytest.ecom_kasir_sale_id}", headers=hdr(admin_token), timeout=20)
        assert r.status_code == 200
