"""Iteration 26: Bundles with harga_channel - backend regression."""
import os
import pytest
import requests

def _load_url():
    p = "/app/frontend/.env"
    if os.path.exists(p):
        for line in open(p):
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip()
    return os.environ.get("REACT_APP_BACKEND_URL", "")

BASE = _load_url().rstrip("/")
assert BASE, "REACT_APP_BACKEND_URL not set"
ADMIN = {"email": "nannsond@gmail.com", "password": "admin123"}
KASIR = {"email": "kasir@tokotani.com", "password": "kasir123"}


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE}/api/auth/login", json=ADMIN, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_hdr(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def product_ids(admin_hdr):
    # create two seed products
    ids = []
    for name, hb, hj in [("TEST_IT26_A", 10000, 15000), ("TEST_IT26_B", 20000, 28000)]:
        r = requests.post(f"{BASE}/api/products",
                          json={"name": name, "sku": name, "category": "Pupuk", "harga_beli": hb, "harga_jual": hj, "stok": 100},
                          headers=admin_hdr, timeout=15)
        assert r.status_code in (200, 201), r.text
        ids.append(r.json()["id"])
    yield ids
    for pid in ids:
        requests.delete(f"{BASE}/api/products/{pid}", headers=admin_hdr, timeout=15)


def test_create_bundle_with_harga_channel(admin_hdr, product_ids):
    payload = {
        "name": "TEST_IT26_Bundle",
        "category": "Paket",
        "harga_jual": 60000,
        "harga_reseller": 55000,
        "harga_online": 65000,
        "harga_channel": {"Shopee": 70000, "Tokopedia": 0, "TikTok Shop": 72000},
        "components": [
            {"product_id": product_ids[0], "name": "A", "qty": 2},
            {"product_id": product_ids[1], "name": "B", "qty": 1},
        ],
    }
    r = requests.post(f"{BASE}/api/bundles", json=payload, headers=admin_hdr, timeout=15)
    assert r.status_code in (200, 201), r.text
    bid = r.json()["id"]
    try:
        # verify via GET list - zero values dropped
        g = requests.get(f"{BASE}/api/bundles", headers=admin_hdr, timeout=15)
        assert g.status_code == 200
        got = next((x for x in g.json() if x["id"] == bid), None)
        assert got is not None
        assert got["harga_channel"].get("Shopee") == 70000
        assert got["harga_channel"].get("TikTok Shop") == 72000
        assert "Tokopedia" not in got["harga_channel"]
        assert got["hpp"] == 10000 * 2 + 20000  # 40000
        assert got["harga_online"] == 65000
        assert got["harga_reseller"] == 55000

        # update: change channel prices
        payload2 = {**payload, "harga_channel": {"Shopee": 69000, "Tokopedia": 68000}}
        u = requests.put(f"{BASE}/api/bundles/{bid}", json=payload2, headers=admin_hdr, timeout=15)
        assert u.status_code == 200, u.text
        g2 = requests.get(f"{BASE}/api/bundles", headers=admin_hdr, timeout=15)
        got2 = next(x for x in g2.json() if x["id"] == bid)
        assert got2["harga_channel"] == {"Shopee": 69000, "Tokopedia": 68000}

        # reduce stock
        rr = requests.post(f"{BASE}/api/bundles/{bid}/reduce", json={"qty": 1}, headers=admin_hdr, timeout=15)
        assert rr.status_code == 200, rr.text
    finally:
        requests.delete(f"{BASE}/api/bundles/{bid}", headers=admin_hdr, timeout=15)


def test_kasir_cannot_create_bundle(product_ids):
    r = requests.post(f"{BASE}/api/auth/login", json=KASIR, timeout=15)
    assert r.status_code == 200
    hdr = {"Authorization": f"Bearer {r.json()['token']}"}
    payload = {"name": "TEST_IT26_K", "category": "Paket", "harga_jual": 1,
               "harga_reseller": 0, "harga_online": 0, "harga_channel": {},
               "components": [{"product_id": product_ids[0], "name": "A", "qty": 1}]}
    r2 = requests.post(f"{BASE}/api/bundles", json=payload, headers=hdr, timeout=15)
    assert r2.status_code == 403
