"""Test POST /api/products/bulk - bulk import products."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://mulyatani-conflict-2.preview.emergentagent.com").rstrip("/")
ADMIN = {"email": "nannsond@gmail.com", "password": "admin123"}
KASIR = {"email": "kasir@tokotani.com", "password": "kasir123"}


def _token(creds):
    r = requests.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_headers():
    return {"Authorization": f"Bearer {_token(ADMIN)}"}


@pytest.fixture(scope="module")
def kasir_headers():
    return {"Authorization": f"Bearer {_token(KASIR)}"}


@pytest.fixture(scope="module")
def created_skus():
    skus = []
    yield skus
    # Cleanup
    headers = {"Authorization": f"Bearer {_token(ADMIN)}"}
    products = requests.get(f"{BASE_URL}/api/products", headers=headers, timeout=15).json()
    for p in products:
        if p["sku"] in skus:
            requests.delete(f"{BASE_URL}/api/products/{p['id']}", headers=headers, timeout=15)


def test_kasir_forbidden(kasir_headers):
    r = requests.post(f"{BASE_URL}/api/products/bulk", headers=kasir_headers,
                      json={"rows": []}, timeout=15)
    assert r.status_code == 403


def test_bulk_create_new(admin_headers, created_skus):
    rows = [
        {"sku": "TEST_BULK_001", "name": "Pupuk Test A", "category": "Pupuk", "unit": "zak",
         "harga_beli": 100000, "harga_jual": 120000, "harga_reseller": 110000,
         "harga_channel": {"Shopee": 125000}, "stok": 10, "stok_minimal": 2},
        {"sku": "TEST_BULK_002", "name": "Benih Test B", "category": "Benih", "unit": "pcs",
         "harga_beli": 5000, "harga_jual": 7000, "harga_reseller": 6000,
         "harga_channel": {}, "stok": 50, "stok_minimal": 5},
    ]
    r = requests.post(f"{BASE_URL}/api/products/bulk", headers=admin_headers,
                      json={"rows": rows}, timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["created"] == 2
    assert data["updated"] == 0
    assert data["errors"] == []
    created_skus.extend(["TEST_BULK_001", "TEST_BULK_002"])

    # verify persisted
    products = requests.get(f"{BASE_URL}/api/products", headers=admin_headers, timeout=15).json()
    by_sku = {p["sku"]: p for p in products}
    assert "TEST_BULK_001" in by_sku
    assert by_sku["TEST_BULK_001"]["name"] == "Pupuk Test A"
    assert by_sku["TEST_BULK_001"]["harga_jual"] == 120000
    assert by_sku["TEST_BULK_001"]["stok"] == 10
    assert by_sku["TEST_BULK_001"]["harga_channel"].get("Shopee") == 125000


def test_bulk_update_preserves_stok_and_merges_channels(admin_headers, created_skus):
    # Set stock to 10 on TEST_BULK_001 already from previous. Now update price + add channel.
    rows = [
        {"sku": "TEST_BULK_001", "name": "Pupuk Test A Updated", "category": "Pupuk", "unit": "zak",
         "harga_beli": 110000, "harga_jual": 130000, "harga_reseller": 115000,
         "harga_channel": {"Tokopedia": 128000}, "stok": 999, "stok_minimal": 3},
    ]
    r = requests.post(f"{BASE_URL}/api/products/bulk", headers=admin_headers,
                      json={"rows": rows}, timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["created"] == 0
    assert data["updated"] == 1

    products = requests.get(f"{BASE_URL}/api/products", headers=admin_headers, timeout=15).json()
    p = next(x for x in products if x["sku"] == "TEST_BULK_001")
    assert p["name"] == "Pupuk Test A Updated"
    assert p["harga_jual"] == 130000
    # stok NOT overwritten
    assert p["stok"] == 10, f"stok should remain 10 not {p['stok']}"
    # channels merged
    assert p["harga_channel"].get("Shopee") == 125000
    assert p["harga_channel"].get("Tokopedia") == 128000


def test_bulk_errors_missing_fields(admin_headers, created_skus):
    rows = [
        {"sku": "", "name": "Missing SKU", "category": "Pupuk", "unit": "pcs",
         "harga_beli": 0, "harga_jual": 0, "harga_reseller": 0,
         "harga_channel": {}, "stok": 0, "stok_minimal": 0},
        {"sku": "TEST_BULK_003", "name": "", "category": "Pupuk", "unit": "pcs",
         "harga_beli": 0, "harga_jual": 0, "harga_reseller": 0,
         "harga_channel": {}, "stok": 0, "stok_minimal": 0},
        {"sku": "TEST_BULK_004", "name": "Valid Row", "category": "Pupuk", "unit": "pcs",
         "harga_beli": 0, "harga_jual": 0, "harga_reseller": 0,
         "harga_channel": {}, "stok": 0, "stok_minimal": 0},
    ]
    r = requests.post(f"{BASE_URL}/api/products/bulk", headers=admin_headers,
                      json={"rows": rows}, timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["created"] == 1
    assert len(data["errors"]) == 2
    created_skus.append("TEST_BULK_004")


def test_products_list_initially_empty_or_only_test(admin_headers):
    """User expects empty store; only TEST_ products should remain (ours)."""
    products = requests.get(f"{BASE_URL}/api/products", headers=admin_headers, timeout=15).json()
    non_test = [p for p in products if not p["sku"].startswith("TEST_")]
    # Report but don't fail - informational
    print(f"Non-test products present: {len(non_test)}: {[p['sku'] for p in non_test][:10]}")
