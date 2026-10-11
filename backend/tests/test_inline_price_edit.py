"""Backend tests for inline price edit feature (iteration 34).

Covers PATCH /api/products/{id}/price and /api/bundles/{id}/price.
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
ADMIN = {"email": "nannsond@gmail.com", "password": "admin123"}
KASIR = {"email": "kasir@tokotani.com", "password": "kasir123"}


def _login(creds):
    r = requests.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, f"login failed: {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_headers():
    return {"Authorization": f"Bearer {_login(ADMIN)}"}


@pytest.fixture(scope="module")
def kasir_headers():
    return {"Authorization": f"Bearer {_login(KASIR)}"}


@pytest.fixture
def test_product(admin_headers):
    sku = f"TEST-{uuid.uuid4().hex[:8]}"
    payload = {"sku": sku, "name": f"TEST_Prod_{sku}", "category": "Pupuk", "unit": "pcs",
               "harga_beli": 1000, "harga_jual": 1500, "harga_reseller": 1200,
               "harga_channel": {}, "stok": 10, "stok_minimal": 2}
    r = requests.post(f"{BASE_URL}/api/products", json=payload, headers=admin_headers, timeout=20)
    assert r.status_code == 200, r.text
    pid = r.json()["id"]
    yield pid
    requests.delete(f"{BASE_URL}/api/products/{pid}", headers=admin_headers, timeout=20)


@pytest.fixture
def test_bundle(admin_headers, test_product):
    payload = {"name": f"TEST_Bundle_{uuid.uuid4().hex[:6]}", "category": "Paket",
               "harga_jual": 5000, "harga_reseller": 4500, "harga_channel": {},
               "components": [{"product_id": test_product, "name": "x", "qty": 1}]}
    r = requests.post(f"{BASE_URL}/api/bundles", json=payload, headers=admin_headers, timeout=20)
    assert r.status_code == 200, r.text
    bid = r.json()["id"]
    yield bid
    requests.delete(f"{BASE_URL}/api/bundles/{bid}", headers=admin_headers, timeout=20)


def _get_product(pid, headers):
    r = requests.get(f"{BASE_URL}/api/products", headers=headers, timeout=20)
    assert r.status_code == 200
    return next((p for p in r.json() if p["id"] == pid), None)


def _get_bundle(bid, headers):
    r = requests.get(f"{BASE_URL}/api/bundles", headers=headers, timeout=20)
    assert r.status_code == 200
    return next((b for b in r.json() if b["id"] == bid), None)


# ---------- Product price updates ----------
class TestProductPrice:
    def test_update_harga_beli(self, admin_headers, test_product):
        r = requests.patch(f"{BASE_URL}/api/products/{test_product}/price",
                           json={"field": "harga_beli", "value": 2500}, headers=admin_headers)
        assert r.status_code == 200
        assert _get_product(test_product, admin_headers)["harga_beli"] == 2500

    def test_update_harga_jual(self, admin_headers, test_product):
        r = requests.patch(f"{BASE_URL}/api/products/{test_product}/price",
                           json={"field": "harga_jual", "value": 3300}, headers=admin_headers)
        assert r.status_code == 200
        assert _get_product(test_product, admin_headers)["harga_jual"] == 3300

    def test_update_harga_reseller(self, admin_headers, test_product):
        r = requests.patch(f"{BASE_URL}/api/products/{test_product}/price",
                           json={"field": "harga_reseller", "value": 2800}, headers=admin_headers)
        assert r.status_code == 200
        assert _get_product(test_product, admin_headers)["harga_reseller"] == 2800

    def test_channel_set_and_remove(self, admin_headers, test_product):
        # set channel price
        r = requests.patch(f"{BASE_URL}/api/products/{test_product}/price",
                           json={"field": "channel", "channel": "TikTok Shop", "value": 4000},
                           headers=admin_headers)
        assert r.status_code == 200
        assert _get_product(test_product, admin_headers)["harga_channel"].get("TikTok Shop") == 4000
        # remove by value=0
        r = requests.patch(f"{BASE_URL}/api/products/{test_product}/price",
                           json={"field": "channel", "channel": "TikTok Shop", "value": 0},
                           headers=admin_headers)
        assert r.status_code == 200
        assert "TikTok Shop" not in _get_product(test_product, admin_headers).get("harga_channel", {})

    def test_negative_value_400(self, admin_headers, test_product):
        r = requests.patch(f"{BASE_URL}/api/products/{test_product}/price",
                           json={"field": "harga_jual", "value": -5}, headers=admin_headers)
        assert r.status_code == 400

    def test_kasir_forbidden(self, kasir_headers, test_product):
        r = requests.patch(f"{BASE_URL}/api/products/{test_product}/price",
                           json={"field": "harga_jual", "value": 100}, headers=kasir_headers)
        assert r.status_code == 403

    def test_unknown_product_404(self, admin_headers):
        fake = "507f1f77bcf86cd799439011"
        r = requests.patch(f"{BASE_URL}/api/products/{fake}/price",
                           json={"field": "harga_jual", "value": 100}, headers=admin_headers)
        assert r.status_code == 404

    def test_invalid_channel_name(self, admin_headers, test_product):
        r = requests.patch(f"{BASE_URL}/api/products/{test_product}/price",
                           json={"field": "channel", "channel": "", "value": 100}, headers=admin_headers)
        assert r.status_code == 400


# ---------- Bundle price updates ----------
class TestBundlePrice:
    def test_bundle_harga_jual(self, admin_headers, test_bundle):
        r = requests.patch(f"{BASE_URL}/api/bundles/{test_bundle}/price",
                           json={"field": "harga_jual", "value": 7500}, headers=admin_headers)
        assert r.status_code == 200
        assert _get_bundle(test_bundle, admin_headers)["harga_jual"] == 7500

    def test_bundle_harga_reseller(self, admin_headers, test_bundle):
        r = requests.patch(f"{BASE_URL}/api/bundles/{test_bundle}/price",
                           json={"field": "harga_reseller", "value": 6500}, headers=admin_headers)
        assert r.status_code == 200
        assert _get_bundle(test_bundle, admin_headers)["harga_reseller"] == 6500

    def test_bundle_channel_set_and_remove(self, admin_headers, test_bundle):
        r = requests.patch(f"{BASE_URL}/api/bundles/{test_bundle}/price",
                           json={"field": "channel", "channel": "TikTok Shop", "value": 8800},
                           headers=admin_headers)
        assert r.status_code == 200
        assert _get_bundle(test_bundle, admin_headers)["harga_channel"].get("TikTok Shop") == 8800
        r = requests.patch(f"{BASE_URL}/api/bundles/{test_bundle}/price",
                           json={"field": "channel", "channel": "TikTok Shop", "value": 0},
                           headers=admin_headers)
        assert r.status_code == 200
        assert "TikTok Shop" not in _get_bundle(test_bundle, admin_headers).get("harga_channel", {})

    def test_bundle_harga_beli_rejected(self, admin_headers, test_bundle):
        r = requests.patch(f"{BASE_URL}/api/bundles/{test_bundle}/price",
                           json={"field": "harga_beli", "value": 1000}, headers=admin_headers)
        assert r.status_code == 400

    def test_bundle_negative_400(self, admin_headers, test_bundle):
        r = requests.patch(f"{BASE_URL}/api/bundles/{test_bundle}/price",
                           json={"field": "harga_jual", "value": -1}, headers=admin_headers)
        assert r.status_code == 400

    def test_bundle_kasir_forbidden(self, kasir_headers, test_bundle):
        r = requests.patch(f"{BASE_URL}/api/bundles/{test_bundle}/price",
                           json={"field": "harga_jual", "value": 1}, headers=kasir_headers)
        assert r.status_code == 403

    def test_bundle_unknown_404(self, admin_headers):
        fake = "507f1f77bcf86cd799439011"
        r = requests.patch(f"{BASE_URL}/api/bundles/{fake}/price",
                           json={"field": "harga_jual", "value": 1}, headers=admin_headers)
        assert r.status_code == 404
