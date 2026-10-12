"""Iteration 58: harga_jual_updated field - set on actual price change via PUT/PATCH/bulk, not on create/no-change."""
import os, time, pytest, requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def admin_client():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": "nannsond@gmail.com", "password": "admin123"})
    assert r.status_code == 200, r.text
    s.headers.update({"Authorization": f"Bearer {r.json()['token']}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def kasir_client():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": "kasir@tokotani.com", "password": "kasir123"})
    assert r.status_code == 200, r.text
    s.headers.update({"Authorization": f"Bearer {r.json()['token']}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def created_ids(admin_client):
    ids = []
    yield ids
    # Cleanup only TEST_ products
    for pid in ids:
        try:
            admin_client.delete(f"{API}/products/{pid}")
        except Exception:
            pass


def _get(admin_client, pid):
    r = admin_client.get(f"{API}/products")
    assert r.status_code == 200
    for p in r.json():
        if p["id"] == pid:
            return p
    return None


def _create(admin_client, sku, harga_jual=10000):
    payload = {"sku": sku, "name": f"Produk {sku}", "category": "TEST", "unit": "pcs",
               "harga_beli": 5000, "harga_jual": harga_jual, "harga_reseller": 0,
               "harga_channel": {}, "stok": 10, "stok_minimal": 1}
    r = admin_client.post(f"{API}/products", json=payload)
    assert r.status_code == 200, r.text
    return r.json()


def test_create_does_not_set_harga_jual_updated(admin_client, created_ids):
    p = _create(admin_client, "TEST_SKU_A", 10000)
    created_ids.append(p["id"])
    doc = _get(admin_client, p["id"])
    assert doc is not None
    assert doc.get("harga_jual_updated") in (None, ""), f"Expected None on create, got {doc.get('harga_jual_updated')}"


def test_patch_price_sets_timestamp_when_changed(admin_client, created_ids):
    p = _create(admin_client, "TEST_SKU_B", 10000)
    created_ids.append(p["id"])
    r = admin_client.patch(f"{API}/products/{p['id']}/price", json={"field": "harga_jual", "value": 12345})
    assert r.status_code == 200
    doc = _get(admin_client, p["id"])
    assert doc.get("harga_jual_updated"), "harga_jual_updated should be set"
    assert doc["harga_jual"] == 12345


def test_patch_price_unchanged_no_timestamp(admin_client, created_ids):
    p = _create(admin_client, "TEST_SKU_C", 10000)
    created_ids.append(p["id"])
    # Same price
    r = admin_client.patch(f"{API}/products/{p['id']}/price", json={"field": "harga_jual", "value": 10000})
    assert r.status_code == 200
    doc = _get(admin_client, p["id"])
    assert not doc.get("harga_jual_updated"), f"Expected no timestamp when price unchanged, got {doc.get('harga_jual_updated')}"


def test_patch_other_field_no_timestamp(admin_client, created_ids):
    p = _create(admin_client, "TEST_SKU_D", 10000)
    created_ids.append(p["id"])
    r = admin_client.patch(f"{API}/products/{p['id']}/price", json={"field": "harga_beli", "value": 7777})
    assert r.status_code == 200
    doc = _get(admin_client, p["id"])
    assert not doc.get("harga_jual_updated"), "harga_beli change should NOT set harga_jual_updated"


def test_put_update_sets_timestamp_when_changed(admin_client, created_ids):
    p = _create(admin_client, "TEST_SKU_E", 10000)
    created_ids.append(p["id"])
    payload = {"sku": "TEST_SKU_E", "name": "Produk TEST_SKU_E", "category": "TEST", "unit": "pcs",
               "harga_beli": 5000, "harga_jual": 15000, "harga_reseller": 0,
               "harga_channel": {}, "stok": 10, "stok_minimal": 1}
    r = admin_client.put(f"{API}/products/{p['id']}", json=payload)
    assert r.status_code == 200
    doc = _get(admin_client, p["id"])
    assert doc.get("harga_jual_updated"), "PUT with changed price should set timestamp"


def test_put_update_no_timestamp_when_unchanged(admin_client, created_ids):
    p = _create(admin_client, "TEST_SKU_F", 10000)
    created_ids.append(p["id"])
    payload = {"sku": "TEST_SKU_F", "name": "Renamed", "category": "TEST", "unit": "pcs",
               "harga_beli": 6000, "harga_jual": 10000, "harga_reseller": 0,
               "harga_channel": {}, "stok": 20, "stok_minimal": 1}
    r = admin_client.put(f"{API}/products/{p['id']}", json=payload)
    assert r.status_code == 200
    doc = _get(admin_client, p["id"])
    assert not doc.get("harga_jual_updated"), "PUT without price change should NOT set timestamp"


def test_bulk_update_sets_timestamp_on_price_change(admin_client, created_ids):
    p = _create(admin_client, "TEST_SKU_G", 10000)
    created_ids.append(p["id"])
    rows = [{"row": 2, "sku": "TEST_SKU_G", "name": "Produk TEST_SKU_G", "category": "TEST",
             "unit": "pcs", "harga_beli": 5000, "harga_jual": 20000, "harga_reseller": 0,
             "harga_channel": {}, "stok": 0, "stok_minimal": 1}]
    r = admin_client.post(f"{API}/products/bulk", json={"rows": rows, "dry_run": False})
    assert r.status_code == 200, r.text
    doc = _get(admin_client, p["id"])
    assert doc.get("harga_jual_updated"), "bulk update with price change should set timestamp"
    assert doc["harga_jual"] == 20000


def test_bulk_update_no_timestamp_when_price_unchanged(admin_client, created_ids):
    p = _create(admin_client, "TEST_SKU_H", 10000)
    created_ids.append(p["id"])
    rows = [{"row": 2, "sku": "TEST_SKU_H", "name": "Produk TEST_SKU_H", "category": "TEST",
             "unit": "pcs", "harga_beli": 5000, "harga_jual": 10000, "harga_reseller": 0,
             "harga_channel": {}, "stok": 0, "stok_minimal": 1}]
    r = admin_client.post(f"{API}/products/bulk", json={"rows": rows, "dry_run": False})
    assert r.status_code == 200
    doc = _get(admin_client, p["id"])
    assert not doc.get("harga_jual_updated"), "bulk update with same price should NOT set timestamp"


def test_bulk_create_does_not_set_timestamp(admin_client, created_ids):
    rows = [{"row": 2, "sku": "TEST_SKU_I", "name": "Produk TEST_SKU_I", "category": "TEST",
             "unit": "pcs", "harga_beli": 5000, "harga_jual": 9999, "harga_reseller": 0,
             "harga_channel": {}, "stok": 5, "stok_minimal": 1}]
    r = admin_client.post(f"{API}/products/bulk", json={"rows": rows, "dry_run": False})
    assert r.status_code == 200
    # find and remember
    all_p = admin_client.get(f"{API}/products").json()
    pid = next(x["id"] for x in all_p if x["sku"] == "TEST_SKU_I")
    created_ids.append(pid)
    doc = next(x for x in all_p if x["id"] == pid)
    assert not doc.get("harga_jual_updated"), "bulk create (new SKU) should NOT set timestamp"


def test_kasir_forbidden_price_update(kasir_client, admin_client, created_ids):
    p = _create(admin_client, "TEST_SKU_J", 10000)
    created_ids.append(p["id"])
    r = kasir_client.patch(f"{API}/products/{p['id']}/price", json={"field": "harga_jual", "value": 11111})
    assert r.status_code == 403
