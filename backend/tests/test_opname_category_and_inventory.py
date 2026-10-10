"""Tests for Opname per Category + Kasir inventory/value money hiding (iteration 30)."""
import os
import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"


def _login(email, password):
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_token():
    return _login("nannsond@gmail.com", "admin123")


@pytest.fixture(scope="module")
def kasir_token():
    return _login("kasir@tokotani.com", "kasir123")


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


# ---------------- Inventory value: role-based money hiding ----------------
MONEY_KEYS = {"harga_beli", "harga_jual", "nilai_modal", "nilai_jual", "potensi_laba"}


def test_inventory_value_admin_has_money(admin_token):
    r = requests.get(f"{BASE}/inventory/value", headers=_h(admin_token), timeout=20)
    assert r.status_code == 200
    d = r.json()
    assert "items" in d and "categories" in d and "total" in d
    assert len(d["items"]) > 0
    first = d["items"][0]
    for k in ("harga_beli", "harga_jual", "nilai_modal", "nilai_jual"):
        assert k in first, f"admin item missing {k}"
    for k in ("nilai_modal", "nilai_jual", "potensi_laba"):
        assert k in d["total"], f"admin total missing {k}"


def test_inventory_value_kasir_hides_money(kasir_token):
    r = requests.get(f"{BASE}/inventory/value", headers=_h(kasir_token), timeout=20)
    assert r.status_code == 200
    d = r.json()
    assert len(d["items"]) > 0
    for it in d["items"]:
        leaked = MONEY_KEYS & set(it.keys())
        assert not leaked, f"kasir item leaks money fields: {leaked}"
        # category / stok / name must still be present for UI
        for k in ("name", "category", "stok", "unit", "id", "sku"):
            assert k in it
    for c in d["categories"]:
        leaked = MONEY_KEYS & set(c.keys())
        assert not leaked, f"kasir category leaks: {leaked}"
        assert "category" in c and "produk" in c
    leaked_total = MONEY_KEYS & set(d["total"].keys())
    assert not leaked_total, f"kasir total leaks: {leaked_total}"
    assert "produk" in d["total"] and "unit" in d["total"]


# ---------------- Bulk opname (used by category-load save) ----------------
def _products(tok):
    r = requests.get(f"{BASE}/products", headers=_h(tok), timeout=20)
    assert r.status_code == 200
    return r.json()


def test_bulk_opname_category_load_admin(admin_token):
    prods = _products(admin_token)
    # pick category 'Pupuk' if available else first non-empty category
    cat = "Pupuk"
    group = [p for p in prods if (p.get("category") or "Lainnya") == cat]
    if not group:
        from collections import Counter
        cats = Counter((p.get("category") or "Lainnya") for p in prods)
        cat = max(cats, key=cats.get)
        group = [p for p in prods if (p.get("category") or "Lainnya") == cat]
    assert len(group) >= 1
    items = [{"product_id": p["id"], "stok_fisik": p["stok"], "alasan": "Penyesuaian", "note": "TEST_cat_load"} for p in group]
    r = requests.post(f"{BASE}/stok-opname/bulk", headers=_h(admin_token), json={"items": items}, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("count") == len(items)
    assert d.get("sesuai") == len(items)
    # Verify history has entries, then cleanup
    hist = requests.get(f"{BASE}/stok-opname", headers=_h(admin_token), timeout=20).json()
    created_ids = []
    for p in group:
        match = next((h for h in hist if h.get("product_id") == p["id"] and h.get("note") == "TEST_cat_load"), None)
        assert match, f"missing opname history for {p['name']}"
        created_ids.append(match["id"])
    # Cleanup
    for oid in created_ids:
        requests.delete(f"{BASE}/stok-opname/{oid}", headers=_h(admin_token), timeout=20)
    # Confirm stock unchanged
    prods_after = _products(admin_token)
    pmap = {p["id"]: p["stok"] for p in prods_after}
    for p in group:
        assert pmap[p["id"]] == p["stok"], f"stock changed for {p['name']}"


def test_bulk_opname_kasir_allowed(kasir_token):
    prods = _products(kasir_token)
    if not prods:
        pytest.skip("no products")
    p = prods[0]
    r = requests.post(f"{BASE}/stok-opname/bulk", headers=_h(kasir_token),
                      json={"items": [{"product_id": p["id"], "stok_fisik": p["stok"], "alasan": "Penyesuaian", "note": "TEST_kasir_bulk"}]}, timeout=20)
    assert r.status_code == 200, r.text
    # cleanup via admin
    admin = _login("nannsond@gmail.com", "admin123")
    hist = requests.get(f"{BASE}/stok-opname", headers=_h(admin), timeout=20).json()
    for h in hist:
        if h.get("note") == "TEST_kasir_bulk":
            requests.delete(f"{BASE}/stok-opname/{h['id']}", headers=_h(admin), timeout=20)
