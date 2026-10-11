"""Tests for GET /api/deliveries month/year filter (iteration 48)."""
import os
import requests
from datetime import datetime

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://mulyatani-1.preview.emergentagent.com").rstrip("/")
ADMIN = {"email": "nannsond@gmail.com", "password": "admin123"}


def _login():
    r = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["token"]


def _headers(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def _get_product(tok):
    r = requests.get(f"{BASE_URL}/api/products", headers=_headers(tok), timeout=20)
    assert r.status_code == 200
    for p in r.json():
        if (p.get("stok") or 0) > 0:
            return p
    return r.json()[0]


def test_deliveries_month_filter_and_lifecycle():
    tok = _login()
    h = _headers(tok)
    prod = _get_product(tok)

    now = datetime.utcnow()
    yr, mo = now.year, now.month

    # Create a delivery transaction (alamat present triggers delivery)
    payload = {
        "items": [{"product_id": prod["id"], "name": prod["name"], "qty": 1,
                   "harga": prod.get("harga_jual", 1000), "is_bundle": False}],
        "payment_method": "Tunai",
        "customer_name": "TEST_ITER48",
        "alamat": "TEST_ADDR_ITER48 Jl. Mangga",
        "telepon": "081200000048",
        "ongkir": 5000,
    }
    r = requests.post(f"{BASE_URL}/api/transactions", json=payload, headers=h, timeout=30)
    assert r.status_code == 200, r.text
    tx = r.json()
    tid = tx["id"]
    assert tx.get("status_antar") == "belum"

    try:
        # 1. Filter current month returns the delivery
        r = requests.get(f"{BASE_URL}/api/deliveries", params={"year": yr, "month": mo}, headers=h, timeout=20)
        assert r.status_code == 200
        ids = [d["id"] for d in r.json()]
        assert tid in ids, f"delivery not in current month list: {ids}"

        # 2. Filter past month (prev year, same month) should NOT include it
        r = requests.get(f"{BASE_URL}/api/deliveries", params={"year": yr - 2, "month": mo}, headers=h, timeout=20)
        assert r.status_code == 200
        ids_past = [d["id"] for d in r.json()]
        assert tid not in ids_past

        # 3. No year/month returns all (should include it)
        r = requests.get(f"{BASE_URL}/api/deliveries", headers=h, timeout=20)
        assert r.status_code == 200
        assert tid in [d["id"] for d in r.json()]

        # 4. Combined with status=belum returns it
        r = requests.get(f"{BASE_URL}/api/deliveries", params={"year": yr, "month": mo, "status": "belum"},
                         headers=h, timeout=20)
        assert r.status_code == 200
        assert tid in [d["id"] for d in r.json()]

        # 5. Combined with status=diantar does NOT return (still belum)
        r = requests.get(f"{BASE_URL}/api/deliveries", params={"year": yr, "month": mo, "status": "diantar"},
                         headers=h, timeout=20)
        assert tid not in [d["id"] for d in r.json()]

        # Set to diantar
        r = requests.put(f"{BASE_URL}/api/deliveries/{tid}/status",
                         json={"status_antar": "diantar"}, headers=h, timeout=20)
        assert r.status_code == 200

        r = requests.get(f"{BASE_URL}/api/deliveries", params={"year": yr, "month": mo, "status": "diantar"},
                         headers=h, timeout=20)
        assert tid in [d["id"] for d in r.json()]

        # Set to selesai
        r = requests.put(f"{BASE_URL}/api/deliveries/{tid}/status",
                         json={"status_antar": "selesai"}, headers=h, timeout=20)
        assert r.status_code == 200

        # 6. Archive and verify archived filter still respects month
        r = requests.put(f"{BASE_URL}/api/deliveries/{tid}/archive",
                         json={"arsip": True}, headers=h, timeout=20)
        assert r.status_code == 200

        r = requests.get(f"{BASE_URL}/api/deliveries", params={"year": yr, "month": mo, "archived": "true"},
                         headers=h, timeout=20)
        assert r.status_code == 200
        assert tid in [d["id"] for d in r.json()]

        # Non-archived should not include
        r = requests.get(f"{BASE_URL}/api/deliveries", params={"year": yr, "month": mo}, headers=h, timeout=20)
        assert tid not in [d["id"] for d in r.json()]

        # Archived filter in different month: should not include
        r = requests.get(f"{BASE_URL}/api/deliveries", params={"year": yr - 2, "month": mo, "archived": "true"},
                         headers=h, timeout=20)
        assert tid not in [d["id"] for d in r.json()]

    finally:
        # Cleanup: delete transaction via admin endpoint if available
        try:
            requests.delete(f"{BASE_URL}/api/transactions/{tid}", headers=h, timeout=20)
        except Exception:
            pass
