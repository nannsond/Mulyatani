"""Backend tests for Stok Opname bulk feature (iteration 28)."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://mulyatani-conflict.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "nannsond@gmail.com", "password": "admin123"}
KASIR = {"email": "kasir@tokotani.com", "password": "kasir123"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_headers():
    return {"Authorization": f"Bearer {_login(ADMIN)}"}


@pytest.fixture(scope="module")
def kasir_headers():
    return {"Authorization": f"Bearer {_login(KASIR)}"}


@pytest.fixture(scope="module")
def sample_products(admin_headers):
    r = requests.get(f"{API}/products", headers=admin_headers, timeout=15)
    assert r.status_code == 200
    prods = r.json()
    samples = [p for p in prods if p["sku"].startswith("CONTOH-")]
    assert len(samples) >= 3, f"need sample CONTOH products, found {len(samples)}"
    return samples


def test_single_opname_still_works(admin_headers, sample_products):
    p = sample_products[0]
    payload = {"product_id": p["id"], "stok_fisik": p["stok"], "alasan": "sesuai", "note": "single-regression"}
    r = requests.post(f"{API}/stok-opname", json=payload, headers=admin_headers, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["product_id"] == p["id"]
    assert data["stok_fisik"] == p["stok"]
    assert data["selisih"] == 0


def test_bulk_empty_rejected(admin_headers):
    r = requests.post(f"{API}/stok-opname/bulk", json={"items": []}, headers=admin_headers, timeout=15)
    assert r.status_code == 400


def test_bulk_duplicate_rejected(admin_headers, sample_products):
    p = sample_products[0]
    items = [
        {"product_id": p["id"], "stok_fisik": p["stok"], "alasan": "sesuai", "note": ""},
        {"product_id": p["id"], "stok_fisik": p["stok"], "alasan": "sesuai", "note": ""},
    ]
    r = requests.post(f"{API}/stok-opname/bulk", json={"items": items}, headers=admin_headers, timeout=15)
    assert r.status_code == 400


def test_bulk_negative_rejected(admin_headers, sample_products):
    p = sample_products[0]
    items = [{"product_id": p["id"], "stok_fisik": -5, "alasan": "sesuai", "note": ""}]
    r = requests.post(f"{API}/stok-opname/bulk", json={"items": items}, headers=admin_headers, timeout=15)
    assert r.status_code == 400


def test_bulk_unknown_product_rejected(admin_headers, sample_products):
    # Use a well-formed but non-existent ObjectId
    fake_id = "0123456789abcdef01234567"
    items = [{"product_id": fake_id, "stok_fisik": 10, "alasan": "sesuai", "note": ""}]
    r = requests.post(f"{API}/stok-opname/bulk", json={"items": items}, headers=admin_headers, timeout=15)
    assert r.status_code == 404

    # And verify no partial doc was created by checking next call still fresh
    # Also ensure that when one is unknown among several, nothing applied
    p = sample_products[1]
    orig_stok = p["stok"]
    items = [
        {"product_id": p["id"], "stok_fisik": orig_stok + 99, "alasan": "lebih", "note": "should-not-apply"},
        {"product_id": fake_id, "stok_fisik": 10, "alasan": "sesuai", "note": ""},
    ]
    r = requests.post(f"{API}/stok-opname/bulk", json={"items": items}, headers=admin_headers, timeout=15)
    assert r.status_code == 404
    # Fetch product again
    r2 = requests.get(f"{API}/products", headers=admin_headers, timeout=15)
    cur = next(x for x in r2.json() if x["id"] == p["id"])
    assert cur["stok"] == orig_stok, "partial write happened despite 404"


def test_bulk_success_creates_session_and_updates_stock(admin_headers, sample_products):
    # Use last 3 sample products
    picks = sample_products[-3:]
    items = []
    expected = {}
    for idx, p in enumerate(picks):
        new_stok = max(0, p["stok"] + (idx - 1))  # some sesuai/kurang/lebih mix
        items.append({"product_id": p["id"], "stok_fisik": new_stok,
                      "alasan": "sesuai" if new_stok == p["stok"] else ("lebih" if new_stok > p["stok"] else "kurang"),
                      "note": "bulk-test"})
        expected[p["id"]] = new_stok
    r = requests.post(f"{API}/stok-opname/bulk", json={"items": items}, headers=admin_headers, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["ok"] is True
    assert data["count"] == len(items)
    assert "session_id" in data and len(data["session_id"]) > 0
    session_id = data["session_id"]

    # Verify history
    r2 = requests.get(f"{API}/stok-opname", headers=admin_headers, timeout=15)
    assert r2.status_code == 200
    hist = r2.json()
    session_rows = [h for h in hist if h.get("session_id") == session_id]
    assert len(session_rows) == len(items)

    # Verify product stock updated
    r3 = requests.get(f"{API}/products", headers=admin_headers, timeout=15)
    prods = {p["id"]: p for p in r3.json()}
    for pid, stok in expected.items():
        assert prods[pid]["stok"] == stok, f"stok mismatch for {pid}"


def test_bulk_works_for_kasir(kasir_headers, sample_products):
    p = sample_products[0]
    r0 = requests.get(f"{API}/products", headers=kasir_headers, timeout=15)
    cur = next(x for x in r0.json() if x["id"] == p["id"])
    items = [{"product_id": p["id"], "stok_fisik": cur["stok"], "alasan": "sesuai", "note": "kasir-bulk"}]
    r = requests.post(f"{API}/stok-opname/bulk", json={"items": items}, headers=kasir_headers, timeout=15)
    assert r.status_code == 200, r.text
    assert r.json()["count"] == 1


def test_restore_sample_stocks(admin_headers):
    """Restore CONTOH sample stocks to approximate original values."""
    r = requests.get(f"{API}/products", headers=admin_headers, timeout=15)
    prods = {p["sku"]: p for p in r.json()}
    targets = {"CONTOH-001": 44, "CONTOH-002": 36, "CONTOH-003": 30, "CONTOH-004": 1, "CONTOH-005": 25}
    items = []
    for sku, stok in targets.items():
        if sku in prods:
            items.append({"product_id": prods[sku]["id"], "stok_fisik": stok,
                          "alasan": "sesuai", "note": "restore sample"})
    if items:
        r = requests.post(f"{API}/stok-opname/bulk", json={"items": items}, headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
