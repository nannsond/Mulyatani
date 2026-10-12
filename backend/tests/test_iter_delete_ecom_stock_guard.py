"""
Regression test for DELETE /api/ecommerce/sales/{sid} stock guard.
Scenario A: create sale -> Dikembalikan+restore_stock=true -> delete sale
            expectation: stock final == stock before (no double restore)
Scenario B: create sale -> delete without return
            expectation: stock final == stock before (one restore)
Cleans up all created rows and ensures product stock returns to original.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://mulyatani-conflict-2.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "nannsond@gmail.com"
ADMIN_PASSWORD = "admin123"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


def _get_contoh_product(headers):
    r = requests.get(f"{API}/products", headers=headers, timeout=20)
    assert r.status_code == 200, r.text
    products = r.json()
    contoh = [p for p in products if (p.get("sku") or "").upper().startswith("CONTOH")]
    assert contoh, "No CONTOH-* products in DB"
    for p in contoh:
        if (p.get("stok") or 0) >= 5:
            return p
    return contoh[0]


def _stock(headers, pid):
    r = requests.get(f"{API}/products", headers=headers, timeout=20)
    assert r.status_code == 200
    for p in r.json():
        if p["id"] == pid:
            return p.get("stok") or 0
    pytest.fail("product not found")


def _create_sale(headers, product, qty=2):
    price = float(product.get("harga_jual") or product.get("price") or 10000)
    payload = {
        "channel": "Shopee",
        "items": [{"product_id": product["id"], "name": product.get("name", "Contoh"), "qty": qty, "harga": price, "price": price}],
        "admin_fee": 0, "ongkir": 0, "biaya_lain": 0,
        "customer_name": "TEST_BUYER", "order_no": "TEST-ORD",
    }
    r = requests.post(f"{API}/ecommerce/sales", headers=headers, json=payload, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()


def test_delete_after_returned_no_double_restore(headers):
    product = _get_contoh_product(headers)
    before = _stock(headers, product["id"])
    qty = 2
    sale = _create_sale(headers, product, qty=qty)
    sid = sale["id"]
    try:
        after_create = _stock(headers, product["id"])
        assert after_create == before - qty, f"expected {before - qty}, got {after_create}"

        # Dikembalikan + restore_stock=true
        r = requests.put(
            f"{API}/ecommerce/sales/{sid}/status",
            headers=headers,
            json={"status": "Dikembalikan", "restore_stock": True},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        assert r.json().get("stock_restored") is True
        after_return = _stock(headers, product["id"])
        assert after_return == before, f"after return expected {before}, got {after_return}"

        # DELETE sale -> must NOT double restore
        r = requests.delete(f"{API}/ecommerce/sales/{sid}", headers=headers, timeout=20)
        assert r.status_code == 200, r.text
        sid = None  # already deleted
        final = _stock(headers, product["id"])
        assert final == before, f"double-restore detected! before={before}, final={final}"
    finally:
        if sid:
            requests.delete(f"{API}/ecommerce/sales/{sid}", headers=headers, timeout=20)
        # ensure original stock
        now = _stock(headers, product["id"])
        assert now == before, f"cleanup stock mismatch: before={before}, now={now}"


def test_delete_without_return_restores_once(headers):
    product = _get_contoh_product(headers)
    before = _stock(headers, product["id"])
    qty = 3
    sale = _create_sale(headers, product, qty=qty)
    sid = sale["id"]
    try:
        after_create = _stock(headers, product["id"])
        assert after_create == before - qty

        r = requests.delete(f"{API}/ecommerce/sales/{sid}", headers=headers, timeout=20)
        assert r.status_code == 200, r.text
        sid = None
        final = _stock(headers, product["id"])
        assert final == before, f"expected restored to {before}, got {final}"
    finally:
        if sid:
            requests.delete(f"{API}/ecommerce/sales/{sid}", headers=headers, timeout=20)
        now = _stock(headers, product["id"])
        assert now == before
