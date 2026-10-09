"""Backend tests for iteration 4:
- Dua harga: Product.harga_reseller on GET/POST/PUT /api/products
- Store info: POST /api/settings/info (admin only) + GET /api/settings returns store_name/address/phone
- Category laba: GET /api/reports/monthly and /yearly return category_laba [{category,omzet,laba}]
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
ADMIN = {"email": "nannsond@gmail.com", "password": "admin123"}
KASIR = {"email": "kasir@tokotani.com", "password": "kasir123"}


def _login(creds):
    r = requests.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_h():
    return {"Authorization": f"Bearer {_login(ADMIN)}"}


@pytest.fixture(scope="module")
def kasir_h():
    return {"Authorization": f"Bearer {_login(KASIR)}"}


# ---------- Dua Harga ----------
class TestDuaHarga:
    def test_products_have_harga_reseller(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/products", headers=admin_h)
        assert r.status_code == 200
        prods = r.json()
        assert len(prods) > 0
        for p in prods:
            assert "harga_jual" in p
            assert "harga_reseller" in p
            assert isinstance(p["harga_reseller"], (int, float))
            # Seed backfill: harga_reseller = round(harga_jual * 0.9) for pre-existing products
            # Not strictly asserted since admin may edit. Just assert >= 0.
            assert p["harga_reseller"] >= 0

    def test_create_product_with_harga_reseller(self, admin_h):
        sku = f"TEST-{uuid.uuid4().hex[:8]}"
        payload = {
            "sku": sku, "name": "TEST Produk Reseller", "category": "Pupuk",
            "unit": "pcs", "harga_beli": 1000, "harga_jual": 2000,
            "harga_reseller": 1800, "stok": 10, "stok_minimal": 2,
        }
        r = requests.post(f"{BASE_URL}/api/products", headers=admin_h, json=payload)
        assert r.status_code == 200, r.text
        created = r.json()
        assert created["harga_reseller"] == 1800
        assert created["harga_jual"] == 2000
        pid = created["id"]

        # GET to confirm persistence
        r2 = requests.get(f"{BASE_URL}/api/products", headers=admin_h)
        found = next((p for p in r2.json() if p["id"] == pid), None)
        assert found is not None
        assert found["harga_reseller"] == 1800

        # Update
        payload["harga_reseller"] = 1700
        payload["harga_jual"] = 2100
        r3 = requests.put(f"{BASE_URL}/api/products/{pid}", headers=admin_h, json=payload)
        assert r3.status_code == 200
        assert r3.json()["harga_reseller"] == 1700
        assert r3.json()["harga_jual"] == 2100

        # cleanup
        requests.delete(f"{BASE_URL}/api/products/{pid}", headers=admin_h)


# ---------- Store Info ----------
class TestStoreInfo:
    def test_set_and_get_store_info_admin(self, admin_h):
        payload = {
            "store_name": "Toko Pe-i Mulya Tani Caruban",
            "address": "Jl. Raya Caruban No. 123, Madiun",
            "phone": "0812-3456-7890",
        }
        r = requests.post(f"{BASE_URL}/api/settings/info", headers=admin_h, json=payload)
        assert r.status_code == 200, r.text

        r2 = requests.get(f"{BASE_URL}/api/settings", headers=admin_h)
        assert r2.status_code == 200
        data = r2.json()
        assert data["store_name"] == payload["store_name"]
        assert data["address"] == payload["address"]
        assert data["phone"] == payload["phone"]

    def test_kasir_cannot_set_store_info(self, kasir_h):
        r = requests.post(f"{BASE_URL}/api/settings/info", headers=kasir_h,
                          json={"store_name": "X", "address": "Y", "phone": "Z"})
        assert r.status_code == 403


# ---------- Category Laba ----------
class TestCategoryLaba:
    def test_monthly_category_laba(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/reports/monthly?year=2026&month=10", headers=admin_h)
        assert r.status_code == 200
        cl = r.json().get("category_laba")
        assert isinstance(cl, list)
        assert len(cl) > 0
        for row in cl:
            assert set(row.keys()) >= {"category", "omzet", "laba"}
            assert isinstance(row["category"], str)
            assert isinstance(row["omzet"], (int, float))
            assert isinstance(row["laba"], (int, float))

    def test_yearly_category_laba(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/reports/yearly?year=2026", headers=admin_h)
        assert r.status_code == 200
        cl = r.json().get("category_laba")
        assert isinstance(cl, list)
        assert len(cl) > 0
        for row in cl:
            assert set(row.keys()) >= {"category", "omzet", "laba"}


# ---------- POS checkout regression with reseller price ----------
class TestPOSResellerCheckout:
    def test_checkout_stores_reseller_price(self, admin_h):
        prods = requests.get(f"{BASE_URL}/api/products", headers=admin_h).json()
        p = next((x for x in prods if x["stok"] > 0 and x["harga_reseller"] > 0 and x["harga_reseller"] != x["harga_jual"]), None)
        if p is None:
            pytest.skip("No product with distinct reseller price available")
        payload = {
            "items": [{"product_id": p["id"], "name": p["name"], "qty": 1, "harga": p["harga_reseller"]}],
            "payment_method": "Tunai",
        }
        r = requests.post(f"{BASE_URL}/api/transactions", headers=admin_h, json=payload)
        assert r.status_code == 200, r.text
        tx = r.json()
        assert tx["items"][0]["harga"] == p["harga_reseller"]
        assert tx["total"] == p["harga_reseller"]
        assert "id" in tx
        assert "_id" not in tx
