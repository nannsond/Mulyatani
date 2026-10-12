"""Iteration 31: Simpan Draf Opname + Isi Sama Sistem

Backend coverage:
- GET /api/stok-opname/draft requires auth
- PUT /api/stok-opname/draft requires auth
- PUT with items persists; GET returns them
- Draft is per-user (admin draft not visible to kasir)
- PUT with empty items & empty note deletes draft
- Successful bulk opname does not auto-clear draft on the backend side (frontend clears via empty PUT)
  but we verify stocks remain unchanged when stok_fisik = system stock (sesuai)
"""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "nannsond@gmail.com", "password": "admin123"}
KASIR = {"email": "kasir@tokotani.com", "password": "kasir123"}


def login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, r.text
    j = r.json()
    return j.get("token") or j["access_token"]


@pytest.fixture(scope="module")
def admin_token():
    return login(ADMIN)


@pytest.fixture(scope="module")
def kasir_token():
    return login(KASIR)


def H(tok):
    return {"Authorization": f"Bearer {tok}"}


# ---------- Auth guard ----------
def test_draft_get_requires_auth():
    r = requests.get(f"{API}/stok-opname/draft", timeout=10)
    assert r.status_code in (401, 403)


def test_draft_put_requires_auth():
    r = requests.put(f"{API}/stok-opname/draft", json={"items": [], "note": ""}, timeout=10)
    assert r.status_code in (401, 403)


# ---------- Round-trip ----------
def _products(tok, n=2):
    r = requests.get(f"{API}/products", headers=H(tok), timeout=15)
    assert r.status_code == 200
    return r.json()[:n]


def test_admin_draft_put_then_get(admin_token):
    prods = _products(admin_token, 2)
    assert len(prods) >= 2
    payload = {
        "items": [
            {"product_id": prods[0]["id"], "stok_fisik": "7", "alasan": "Penyesuaian"},
            {"product_id": prods[1]["id"], "stok_fisik": "", "alasan": "Rusak"},
        ],
        "note": "TEST_iter31_admin",
    }
    r = requests.put(f"{API}/stok-opname/draft", json=payload, headers=H(admin_token), timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["updated_at"] is not None

    g = requests.get(f"{API}/stok-opname/draft", headers=H(admin_token), timeout=15)
    assert g.status_code == 200
    d = g.json()
    assert d["note"] == "TEST_iter31_admin"
    assert len(d["items"]) == 2
    assert d["items"][0]["product_id"] == prods[0]["id"]
    assert d["items"][0]["stok_fisik"] == "7"
    assert d["items"][1]["alasan"] == "Rusak"


def test_draft_is_per_user(admin_token, kasir_token):
    # admin set in previous test; kasir should see empty / different
    g = requests.get(f"{API}/stok-opname/draft", headers=H(kasir_token), timeout=15)
    assert g.status_code == 200
    d = g.json()
    assert d.get("note", "") != "TEST_iter31_admin"
    # kasir writes its own draft
    prods = _products(kasir_token, 1)
    payload = {"items": [{"product_id": prods[0]["id"], "stok_fisik": "3", "alasan": "Penyesuaian"}],
               "note": "TEST_iter31_kasir"}
    r = requests.put(f"{API}/stok-opname/draft", json=payload, headers=H(kasir_token), timeout=15)
    assert r.status_code == 200
    # admin draft should still be its own
    ga = requests.get(f"{API}/stok-opname/draft", headers=H(admin_token), timeout=15)
    assert ga.json()["note"] == "TEST_iter31_admin"
    gk = requests.get(f"{API}/stok-opname/draft", headers=H(kasir_token), timeout=15)
    assert gk.json()["note"] == "TEST_iter31_kasir"


def test_draft_empty_deletes(admin_token, kasir_token):
    r = requests.put(f"{API}/stok-opname/draft", json={"items": [], "note": ""},
                     headers=H(admin_token), timeout=15)
    assert r.status_code == 200
    assert r.json()["updated_at"] is None
    g = requests.get(f"{API}/stok-opname/draft", headers=H(admin_token), timeout=15)
    assert g.json()["items"] == []
    assert g.json().get("updated_at") in (None,)

    # cleanup kasir too
    requests.put(f"{API}/stok-opname/draft", json={"items": [], "note": ""},
                 headers=H(kasir_token), timeout=15)
    g2 = requests.get(f"{API}/stok-opname/draft", headers=H(kasir_token), timeout=15)
    assert g2.json()["items"] == []


# ---------- "Sama" bulk (stok unchanged) ----------
def test_bulk_opname_same_as_system_keeps_stock(admin_token):
    prods = requests.get(f"{API}/products", headers=H(admin_token), timeout=15).json()
    # pick 2 products
    sample = prods[:2]
    before = {p["id"]: p["stok"] for p in sample}
    payload = {"items": [{"product_id": p["id"], "stok_fisik": p["stok"],
                          "alasan": "Penyesuaian", "note": "TEST_iter31_same"} for p in sample]}
    r = requests.post(f"{API}/stok-opname/bulk", json=payload, headers=H(admin_token), timeout=20)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is True
    assert body["count"] == len(sample)
    assert body["sesuai"] == len(sample)
    session_id = body["session_id"]

    # verify stock unchanged via products list
    after = {p["id"]: p["stok"] for p in requests.get(f"{API}/products", headers=H(admin_token), timeout=15).json()}
    for p in sample:
        assert after[p["id"]] == before[p["id"]]

    # cleanup created opname rows (admin only)
    hist = requests.get(f"{API}/stok-opname", headers=H(admin_token), timeout=15).json()
    for row in hist:
        if row.get("session_id") == session_id:
            rid = row.get("id") or row.get("_id")
            if rid:
                requests.delete(f"{API}/stok-opname/{rid}", headers=H(admin_token), timeout=10)


def test_final_cleanup_drafts(admin_token, kasir_token):
    for tok in (admin_token, kasir_token):
        requests.put(f"{API}/stok-opname/draft", json={"items": [], "note": ""},
                     headers=H(tok), timeout=10)
        g = requests.get(f"{API}/stok-opname/draft", headers=H(tok), timeout=10)
        assert g.json()["items"] == []
