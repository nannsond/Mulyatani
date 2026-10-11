"""Backend tests for GET /api/inventory/value (inventory asset value feature)."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN = {"email": "nannsond@gmail.com", "password": "admin123"}


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_h(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def seed_products(admin_h):
    """Create two TEST_ products and yield their ids. Cleanup afterwards."""
    created = []
    for i, (sku, name, stok) in enumerate([("TESTSKU1", "TEST_Pupuk 1", 5),
                                            ("TESTSKU2", "TEST_Pupuk 2", 10)]):
        payload = {"sku": f"{sku}-{uuid.uuid4().hex[:4]}", "name": name, "category": "TEST_Kategori",
                   "unit": "kg", "harga_beli": 100000, "harga_jual": 120000, "stok": stok}
        r = requests.post(f"{API}/products", json=payload, headers=admin_h, timeout=20)
        assert r.status_code in (200, 201), r.text
        created.append(r.json())
    yield created
    for p in created:
        pid = p.get("id") or p.get("_id")
        if pid:
            requests.delete(f"{API}/products/{pid}", headers=admin_h, timeout=20)


@pytest.fixture(scope="module")
def kasir_user(admin_h):
    email = f"test_kasir_{uuid.uuid4().hex[:6]}@test.com"
    r = requests.post(f"{API}/users", json={"email": email, "password": "kasir123",
                                            "name": "TEST_Kasir", "role": "kasir"},
                      headers=admin_h, timeout=20)
    assert r.status_code in (200, 201), r.text
    uid = r.json()["id"]
    tok = requests.post(f"{API}/auth/login",
                        json={"email": email, "password": "kasir123"}, timeout=20).json()["token"]
    yield {"id": uid, "token": tok, "email": email}
    requests.delete(f"{API}/users/{uid}", headers=admin_h, timeout=20)


# ---------- auth tests ----------
def test_inventory_value_requires_auth():
    r = requests.get(f"{API}/inventory/value", timeout=20)
    assert r.status_code in (401, 403)


def test_inventory_value_forbidden_for_kasir(kasir_user):
    r = requests.get(f"{API}/inventory/value",
                     headers={"Authorization": f"Bearer {kasir_user['token']}"}, timeout=20)
    assert r.status_code == 403


# ---------- data correctness ----------
def test_inventory_value_structure_and_totals(admin_h, seed_products):
    r = requests.get(f"{API}/inventory/value", headers=admin_h, timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    assert set(data.keys()) >= {"total", "categories", "items"}
    total = data["total"]
    for k in ("produk", "unit", "nilai_modal", "nilai_jual", "potensi_laba"):
        assert k in total, f"missing total.{k}"
    assert total["potensi_laba"] == total["nilai_jual"] - total["nilai_modal"]

    # Our two seeded products contribute 5*100000+10*100000=1_500_000 modal
    seeded_ids = {p["id"] for p in seed_products}
    seeded_items = [i for i in data["items"] if i["id"] in seeded_ids]
    assert len(seeded_items) == 2
    seeded_modal = sum(i["nilai_modal"] for i in seeded_items)
    seeded_jual = sum(i["nilai_jual"] for i in seeded_items)
    assert seeded_modal == 1_500_000
    assert seeded_jual == 1_800_000

    # items sorted by nilai_modal desc
    modals = [i["nilai_modal"] for i in data["items"]]
    assert modals == sorted(modals, reverse=True)

    # categories should contain TEST_Kategori with produk=2, nilai_modal=1_500_000
    cat = next((c for c in data["categories"] if c["category"] == "TEST_Kategori"), None)
    assert cat is not None
    assert cat["produk"] == 2
    assert cat["nilai_modal"] == 1_500_000
    assert cat["unit"] == 15


def test_inventory_value_updates_after_opname(admin_h, seed_products):
    # Opname TEST_Pupuk 1 to stok 20 (was 5)
    pid = seed_products[0]["id"]
    r = requests.post(f"{API}/stok-opname",
                      json={"product_id": pid, "stok_fisik": 20,
                            "alasan": "TEST_Adjustment", "note": "test"},
                      headers=admin_h, timeout=20)
    assert r.status_code in (200, 201), r.text

    r = requests.get(f"{API}/inventory/value", headers=admin_h, timeout=20)
    data = r.json()
    item = next(i for i in data["items"] if i["id"] == pid)
    assert item["stok"] == 20
    assert item["nilai_modal"] == 20 * 100000
    assert item["nilai_jual"] == 20 * 120000


def test_inventory_value_negative_stock_counted_as_zero(admin_h):
    # Create product with negative stock via opname (set to -3)
    payload = {"sku": f"TESTNEG-{uuid.uuid4().hex[:4]}", "name": "TEST_Neg", "category": "TEST_Kategori",
               "unit": "pcs", "harga_beli": 50000, "harga_jual": 70000, "stok": 0}
    r = requests.post(f"{API}/products", json=payload, headers=admin_h, timeout=20)
    assert r.status_code in (200, 201)
    pid = r.json()["id"]
    try:
        r = requests.post(f"{API}/stok-opname",
                          json={"product_id": pid, "stok_fisik": -3, "alasan": "TEST"},
                          headers=admin_h, timeout=20)
        assert r.status_code in (200, 201)
        r = requests.get(f"{API}/inventory/value", headers=admin_h, timeout=20)
        item = next(i for i in r.json()["items"] if i["id"] == pid)
        assert item["stok"] == 0, "negative stock must be treated as 0"
        assert item["nilai_modal"] == 0
    finally:
        requests.delete(f"{API}/products/{pid}", headers=admin_h, timeout=20)


def test_cleanup_stok_opname_docs(admin_h):
    # Final: remove TEST_ stok_opname docs via listing & deletion if endpoint exists
    r = requests.get(f"{API}/stok-opname", headers=admin_h, timeout=20)
    if r.status_code == 200:
        for d in r.json():
            if d.get("alasan", "").startswith("TEST") or d.get("product_name", "").startswith("TEST_"):
                oid = d.get("id") or d.get("_id")
                if oid:
                    requests.delete(f"{API}/stok-opname/{oid}", headers=admin_h, timeout=10)
    # Soft assertion only - cleanup best-effort
    assert True
