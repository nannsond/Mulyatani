"""Iteration 57: bulk products preview + bulk bundles preview tests."""
import os
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/") + "/api"


@pytest.fixture(scope="module")
def admin():
    r = requests.post(f"{BASE}/auth/login", json={"email": "nannsond@gmail.com", "password": "admin123"})
    assert r.status_code == 200, r.text
    s = requests.Session()
    s.headers["Authorization"] = f"Bearer {r.json()['token']}"
    return s


@pytest.fixture(scope="module")
def kasir():
    r = requests.post(f"{BASE}/auth/login", json={"email": "kasir@tokotani.com", "password": "kasir123"})
    assert r.status_code == 200, r.text
    s = requests.Session()
    s.headers["Authorization"] = f"Bearer {r.json()['token']}"
    return s


@pytest.fixture(scope="module")
def cleanup(admin):
    """Remember IDs created so we can clean up."""
    yield
    # Delete bundles then products
    for b in admin.get(f"{BASE}/bundles").json():
        admin.delete(f"{BASE}/bundles/{b['id']}")
    for p in admin.get(f"{BASE}/products").json():
        admin.delete(f"{BASE}/products/{p['id']}")


def _prod(sku, name="N", **kw):
    base = dict(sku=sku, name=name, category="Pupuk", unit="pcs",
                harga_beli=100, harga_jual=200, harga_reseller=180,
                harga_channel={}, stok=10, stok_minimal=2)
    base.update(kw)
    return base


# ---------- products/bulk preview ----------
def test_product_bulk_dry_run_shows_preview_and_saves_nothing(admin, cleanup):
    rows = [
        _prod("TEST_P1", "Produk Satu"),
        _prod("TEST_P2", "Produk Dua"),
        _prod("", "No SKU"),                                  # error: SKU kosong
        _prod("TEST_DUP", "A"), _prod("TEST_DUP", "B"),       # dup SKU
        _prod("TEST_NEG", "Neg", harga_beli=-1),              # negative
        _prod("TEST_CH", "Ch", harga_channel={"NoChan": 100}),# unknown channel
        _prod("TEST_WARN", "Warn", harga_jual=0),             # warn
    ]
    r = admin.post(f"{BASE}/products/bulk", json={"rows": rows, "dry_run": True})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["created"] == 0 and data["updated"] == 0
    preview = data["preview"]
    assert len(preview) == len(rows)
    statuses = [p["status"] for p in preview]
    # row index 2 (empty sku), 4 (dup), 5 (neg), 6 (unknown channel) -> error
    assert statuses[2] == "error" and "SKU kosong" in preview[2]["message"]
    assert statuses[4] == "error" and "ganda" in preview[4]["message"]
    assert statuses[5] == "error" and "negatif" in preview[5]["message"]
    assert statuses[6] == "error" and "Channel" in preview[6]["message"]
    assert statuses[7] == "baru" and "Harga Normal 0" in preview[7]["message"]
    # Nothing persisted
    assert all(p["sku"] not in ("TEST_P1", "TEST_P2", "TEST_WARN")
               for p in admin.get(f"{BASE}/products").json())


def test_product_bulk_commit_saves_only_valid(admin, cleanup):
    rows = [
        _prod("TEST_OK1", "Ok One"),
        _prod("TEST_OK2", "Ok Two"),
        _prod("", "bad"),  # error
    ]
    r = admin.post(f"{BASE}/products/bulk", json={"rows": rows, "dry_run": False})
    assert r.status_code == 200
    data = r.json()
    assert data["created"] == 2 and data["updated"] == 0
    skus = {p["sku"] for p in admin.get(f"{BASE}/products").json()}
    assert "TEST_OK1" in skus and "TEST_OK2" in skus


def test_product_bulk_update_preserves_stok(admin, cleanup):
    # TEST_OK1 was created with stok=10 in previous test
    r = admin.post(f"{BASE}/products/bulk", json={
        "rows": [_prod("TEST_OK1", "Ok One Updated", harga_jual=999, stok=777)],
        "dry_run": False,
    })
    data = r.json()
    assert data["updated"] == 1
    p = next(p for p in admin.get(f"{BASE}/products").json() if p["sku"] == "TEST_OK1")
    assert p["name"] == "Ok One Updated"
    assert p["harga_jual"] == 999
    assert p["stok"] == 10  # preserved


def test_product_bulk_kasir_forbidden(kasir):
    r = kasir.post(f"{BASE}/products/bulk", json={"rows": [_prod("x", "y")], "dry_run": True})
    assert r.status_code == 403


# ---------- bundles/bulk preview ----------
def _ensure_prods(admin):
    """Make sure PPK-001 and PPK-002 exist for bundle tests."""
    existing = {p["sku"] for p in admin.get(f"{BASE}/products").json()}
    rows = []
    for sku in ("PPK-001", "PPK-002", "BNH-001"):
        if sku not in existing:
            rows.append(_prod(sku, f"Prod {sku}", harga_beli=1000, harga_jual=2000))
    if rows:
        admin.post(f"{BASE}/products/bulk", json={"rows": rows, "dry_run": False})


def test_bundle_bulk_dry_run_errors_and_warns(admin, cleanup):
    _ensure_prods(admin)
    bundles = [
        {"rows": [2], "name": "TEST_B1", "harga_jual": 50000,
         "components": [{"sku": "PPK-001", "qty": 1}, {"sku": "PPK-002", "qty": 2}]},
        {"rows": [4], "name": "", "components": [{"sku": "PPK-001", "qty": 1}]},  # name empty
        {"rows": [5], "name": "TEST_NOCOMP", "components": []},                   # no components
        {"rows": [6], "name": "TEST_BADSKU",
         "components": [{"sku": "NOPE", "qty": 1}]},                              # unknown sku
        {"rows": [7], "name": "TEST_BADQTY",
         "components": [{"sku": "PPK-001", "qty": 0}]},                           # bad qty
        {"rows": [8], "name": "TEST_DUP",
         "components": [{"sku": "PPK-001", "qty": 1}, {"sku": "PPK-001", "qty": 2}]},
        {"rows": [9], "name": "TEST_UNKCH", "harga_channel": {"Nope": 1},
         "components": [{"sku": "PPK-001", "qty": 1}]},
    ]
    r = admin.post(f"{BASE}/bundles/bulk", json={"bundles": bundles, "dry_run": True})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["created"] == 0 and d["updated"] == 0
    p = d["preview"]
    assert p[0]["status"] == "baru"
    assert p[1]["status"] == "error" and "Nama" in p[1]["message"]
    assert p[2]["status"] == "error" and "komponen" in p[2]["message"]
    assert p[3]["status"] == "error" and "tidak ada" in p[3]["message"]
    assert p[4]["status"] == "error" and "bilangan" in p[4]["message"]
    assert p[5]["status"] == "error" and "ganda" in p[5]["message"]
    assert p[6]["status"] == "error" and "Channel" in p[6]["message"]
    assert len(admin.get(f"{BASE}/bundles").json()) == 0


def test_bundle_bulk_commit_create_then_update(admin, cleanup):
    _ensure_prods(admin)
    bundles = [{"rows": [2], "name": "TEST_BUNDLE_X", "harga_jual": 50000,
                "components": [{"sku": "PPK-001", "qty": 1}]}]
    r = admin.post(f"{BASE}/bundles/bulk", json={"bundles": bundles, "dry_run": False})
    assert r.json()["created"] == 1
    # Second time -> update (case-insensitive)
    bundles[0]["name"] = "test_bundle_x"
    bundles[0]["harga_jual"] = 75000
    r2 = admin.post(f"{BASE}/bundles/bulk", json={"bundles": bundles, "dry_run": False})
    assert r2.json()["updated"] == 1
    b = next(b for b in admin.get(f"{BASE}/bundles").json() if b["name"].lower() == "test_bundle_x")
    assert b["harga_jual"] == 75000


def test_bundle_bulk_kasir_forbidden(kasir):
    r = kasir.post(f"{BASE}/bundles/bulk", json={"bundles": [], "dry_run": True})
    assert r.status_code == 403
