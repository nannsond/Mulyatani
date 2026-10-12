"""Tests for iteration 36: Admin edit online sale (PUT /api/ecommerce/sales/{id})."""
import os
import pytest
import requests
from datetime import datetime, timezone

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"


def _login(email, pw):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_token():
    return _login("nannsond@gmail.com", "admin123")


@pytest.fixture(scope="module")
def kasir_token():
    return _login("kasir@tokotani.com", "kasir123")


@pytest.fixture(scope="module")
def admin_h(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def kasir_h(kasir_token):
    return {"Authorization": f"Bearer {kasir_token}"}


@pytest.fixture(scope="module")
def channel_name(admin_h):
    r = requests.get(f"{API}/channels", headers=admin_h, timeout=30)
    assert r.status_code == 200
    chans = [c for c in r.json() if c.get("active")]
    assert chans, "no active channels"
    # prefer TikTok Shop else first
    for c in chans:
        if c["name"] == "TikTok Shop":
            return c["name"]
    return chans[0]["name"]


@pytest.fixture(scope="module")
def test_product(admin_h):
    payload = {
        "name": "TEST_ITER36_PRODUCT",
        "sku": f"TEST36-{int(datetime.now().timestamp())}",
        "category": "Lainnya",
        "harga_jual": 10000,
        "harga_beli": 4000,
        "stok": 100,
        "unit": "pcs",
    }
    r = requests.post(f"{API}/products", json=payload, headers=admin_h, timeout=30)
    assert r.status_code in (200, 201), r.text
    prod = r.json()
    yield prod
    requests.delete(f"{API}/products/{prod['id']}", headers=admin_h, timeout=30)


def _create_sale(admin_h, channel, product, qty=3, harga=10000, admin_fee=500, ongkir=1000, biaya_lain=200):
    payload = {
        "channel": channel,
        "items": [{"product_id": product["id"], "name": product.get("name", "TEST"), "qty": qty, "harga": harga}],
        "admin_fee": admin_fee,
        "ongkir": ongkir,
        "biaya_lain": biaya_lain,
        "customer_name": "TEST Customer",
        "order_no": "TESTORDER-1",
        "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
    }
    r = requests.post(f"{API}/ecommerce/sales", json=payload, headers=admin_h, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


def _get_stock(admin_h, pid):
    r = requests.get(f"{API}/products", headers=admin_h, timeout=30)
    assert r.status_code == 200
    for p in r.json():
        if p["id"] == pid:
            return p["stok"]
    raise AssertionError(f"product {pid} not found")


# ---- tests ----

def test_edit_recomputes_totals_and_adjusts_stock(admin_h, channel_name, test_product):
    sale = _create_sale(admin_h, channel_name, test_product, qty=3, harga=10000, admin_fee=500, ongkir=1000, biaya_lain=200)
    sid = sale["id"]
    try:
        stock_before = _get_stock(admin_h, test_product["id"])  # after sale deducted
        # Increase qty 3 -> 5 (reduce stock by 2), change harga, change date
        new_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        payload = {
            "channel": channel_name,
            "date": new_date,
            "order_no": "TESTORDER-2",
            "customer_name": "TEST Edited",
            "items": [{"qty": 5, "harga": 12000}],
            "admin_fee": 700,
            "ongkir": 1500,
            "biaya_lain": 300,
        }
        r = requests.put(f"{API}/ecommerce/sales/{sid}", json=payload, headers=admin_h, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["omzet"] == 5 * 12000
        assert data["total_fee"] == 700 + 1500 + 300
        assert data["laba_kotor"] == data["omzet"] - data["hpp"]
        assert data["laba_bersih"] == data["laba_kotor"] - data["total_fee"]
        assert data["order_no"] == "TESTORDER-2"
        assert data["customer_name"] == "TEST Edited"
        # stock should decrease by (5-3)=2
        stock_after = _get_stock(admin_h, test_product["id"])
        assert stock_after == stock_before - 2, f"stock {stock_before}->{stock_after}"

        # Decrease qty back 5->2 (return 3 stock)
        payload["items"] = [{"qty": 2, "harga": 12000}]
        r = requests.put(f"{API}/ecommerce/sales/{sid}", json=payload, headers=admin_h, timeout=30)
        assert r.status_code == 200
        assert _get_stock(admin_h, test_product["id"]) == stock_after + 3

        # GET to verify persisted
        g = requests.get(f"{API}/ecommerce/sales", headers=admin_h, timeout=30)
        row = next((x for x in g.json() if x["id"] == sid), None)
        assert row and row["customer_name"] == "TEST Edited" and row["items"][0]["qty"] == 2
    finally:
        requests.delete(f"{API}/ecommerce/sales/{sid}", headers=admin_h, timeout=30)


def test_edit_same_date_keeps_created_at(admin_h, channel_name, test_product):
    sale = _create_sale(admin_h, channel_name, test_product)
    sid = sale["id"]
    original_created = sale["created_at"]
    try:
        payload = {
            "channel": channel_name,
            "date": original_created[:10],
            "order_no": sale.get("order_no", ""),
            "customer_name": sale.get("customer_name", ""),
            "items": [{"qty": i["qty"], "harga": i["harga"]} for i in sale["items"]],
            "admin_fee": sale.get("admin_fee", 0),
            "ongkir": sale.get("ongkir", 0),
            "biaya_lain": sale.get("biaya_lain", 0),
        }
        r = requests.put(f"{API}/ecommerce/sales/{sid}", json=payload, headers=admin_h, timeout=30)
        assert r.status_code == 200
        assert r.json()["created_at"] == original_created
    finally:
        requests.delete(f"{API}/ecommerce/sales/{sid}", headers=admin_h, timeout=30)


def test_edit_different_date_sets_midnight(admin_h, channel_name, test_product):
    sale = _create_sale(admin_h, channel_name, test_product)
    sid = sale["id"]
    try:
        payload = {
            "channel": channel_name,
            "date": "2025-01-15",
            "order_no": "",
            "customer_name": "",
            "items": [{"qty": i["qty"], "harga": i["harga"]} for i in sale["items"]],
            "admin_fee": 0, "ongkir": 0, "biaya_lain": 0,
        }
        r = requests.put(f"{API}/ecommerce/sales/{sid}", json=payload, headers=admin_h, timeout=30)
        assert r.status_code == 200
        assert r.json()["created_at"] == "2025-01-15T00:00:00+00:00"
    finally:
        requests.delete(f"{API}/ecommerce/sales/{sid}", headers=admin_h, timeout=30)


def test_edit_validation_errors(admin_h, channel_name, test_product):
    sale = _create_sale(admin_h, channel_name, test_product)
    sid = sale["id"]
    try:
        base = {
            "channel": channel_name, "date": "2025-01-15", "order_no": "", "customer_name": "",
            "items": [{"qty": 1, "harga": 10000}], "admin_fee": 0, "ongkir": 0, "biaya_lain": 0,
        }
        # invalid channel
        r = requests.put(f"{API}/ecommerce/sales/{sid}", json={**base, "channel": "INVALID_CH"}, headers=admin_h, timeout=30)
        assert r.status_code == 400
        # qty < 1
        r = requests.put(f"{API}/ecommerce/sales/{sid}", json={**base, "items": [{"qty": 0, "harga": 10000}]}, headers=admin_h, timeout=30)
        assert r.status_code == 400
        # len mismatch (sale has 1 item, send 2)
        r = requests.put(f"{API}/ecommerce/sales/{sid}", json={**base, "items": [{"qty": 1, "harga": 10000}, {"qty": 1, "harga": 10000}]}, headers=admin_h, timeout=30)
        assert r.status_code == 400
        # negative fee
        r = requests.put(f"{API}/ecommerce/sales/{sid}", json={**base, "admin_fee": -5}, headers=admin_h, timeout=30)
        assert r.status_code == 400
    finally:
        requests.delete(f"{API}/ecommerce/sales/{sid}", headers=admin_h, timeout=30)


def test_edit_unknown_id_returns_404(admin_h, channel_name):
    payload = {
        "channel": channel_name, "date": "2025-01-15", "order_no": "", "customer_name": "",
        "items": [{"qty": 1, "harga": 100}], "admin_fee": 0, "ongkir": 0, "biaya_lain": 0,
    }
    # Use a valid-shaped ObjectId that doesn't exist
    r = requests.put(f"{API}/ecommerce/sales/507f1f77bcf86cd799439011", json=payload, headers=admin_h, timeout=30)
    assert r.status_code == 404


def test_edit_forbidden_for_kasir(admin_h, kasir_h, channel_name, test_product):
    sale = _create_sale(admin_h, channel_name, test_product)
    sid = sale["id"]
    try:
        payload = {
            "channel": channel_name, "date": "2025-01-15", "order_no": "", "customer_name": "",
            "items": [{"qty": 1, "harga": 10000}], "admin_fee": 0, "ongkir": 0, "biaya_lain": 0,
        }
        r = requests.put(f"{API}/ecommerce/sales/{sid}", json=payload, headers=kasir_h, timeout=30)
        assert r.status_code == 403
    finally:
        requests.delete(f"{API}/ecommerce/sales/{sid}", headers=admin_h, timeout=30)
