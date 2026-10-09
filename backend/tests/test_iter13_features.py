"""Backend tests for iter13: harga_channel on products and transactions date/sort filter."""
import os
import pytest
import requests

def _read_env(key):
    try:
        with open("/app/frontend/.env") as f:
            for ln in f:
                if ln.strip().startswith(f"{key}="):
                    return ln.strip().split("=", 1)[1]
    except Exception:
        return None
    return None

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _read_env("REACT_APP_BACKEND_URL")).rstrip("/")
ADMIN = {"email": "nannsond@gmail.com", "password": "T0k0Mulya#Tani2026"}


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# ---------- Product harga_channel ----------
class TestProductHargaChannel:
    def test_products_have_harga_channel_field(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/products", headers=admin_headers)
        assert r.status_code == 200
        prods = r.json()
        assert len(prods) > 0
        for p in prods:
            assert "harga_channel" in p
            assert isinstance(p["harga_channel"], dict)

    def test_update_product_harga_channel_persists(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/products", headers=admin_headers)
        prods = r.json()
        # pick Cangkul Baja Super if exists else first
        target = next((p for p in prods if p.get("name") == "Cangkul Baja Super"), prods[0])
        pid = target["id"]
        original_channel = target.get("harga_channel", {})

        payload = {
            "sku": target["sku"], "name": target["name"], "category": target["category"],
            "unit": target["unit"], "harga_beli": target["harga_beli"],
            "harga_jual": target["harga_jual"], "harga_reseller": target["harga_reseller"],
            "harga_online": target["harga_online"],
            "harga_channel": {"Shopee": 99000, "Tokopedia": 97000, "Lazada": 98000, "TikTok Shop": 96500},
            "stok": target["stok"], "stok_minimal": target["stok_minimal"],
        }
        up = requests.put(f"{BASE_URL}/api/products/{pid}", json=payload, headers=admin_headers)
        assert up.status_code == 200, up.text
        got = up.json()
        assert got["harga_channel"]["Shopee"] == 99000
        assert got["harga_channel"]["Tokopedia"] == 97000

        # GET verify persistence
        r2 = requests.get(f"{BASE_URL}/api/products", headers=admin_headers)
        p2 = next(p for p in r2.json() if p["id"] == pid)
        assert p2["harga_channel"]["Shopee"] == 99000
        assert p2["harga_channel"]["Lazada"] == 98000

        # Restore (keep Shopee=99000 and Tokopedia=97000 as per expected seed, or restore original)
        payload["harga_channel"] = original_channel if original_channel else {"Shopee": 99000, "Tokopedia": 97000}
        requests.put(f"{BASE_URL}/api/products/{pid}", json=payload, headers=admin_headers)

    def test_update_without_harga_channel_defaults_empty(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/products", headers=admin_headers)
        prods = r.json()
        target = prods[-1]
        pid = target["id"]
        original_channel = target.get("harga_channel", {})
        payload = {
            "sku": target["sku"], "name": target["name"], "category": target["category"],
            "unit": target["unit"], "harga_beli": target["harga_beli"],
            "harga_jual": target["harga_jual"], "harga_reseller": target["harga_reseller"],
            "harga_online": target["harga_online"],
            # omit harga_channel
            "stok": target["stok"], "stok_minimal": target["stok_minimal"],
        }
        up = requests.put(f"{BASE_URL}/api/products/{pid}", json=payload, headers=admin_headers)
        assert up.status_code == 200
        assert up.json()["harga_channel"] == {}
        # restore
        payload["harga_channel"] = original_channel
        requests.put(f"{BASE_URL}/api/products/{pid}", json=payload, headers=admin_headers)


# ---------- Transactions filter ----------
class TestTransactionsFilter:
    def test_list_default_desc(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/transactions?limit=20", headers=admin_headers)
        assert r.status_code == 200
        txs = r.json()
        if len(txs) >= 2:
            assert txs[0]["created_at"] >= txs[-1]["created_at"]

    def test_list_sort_asc(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/transactions?limit=20&sort=asc", headers=admin_headers)
        assert r.status_code == 200
        txs = r.json()
        if len(txs) >= 2:
            assert txs[0]["created_at"] <= txs[-1]["created_at"]

    def test_filter_by_year(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/transactions?date=2025&limit=2000", headers=admin_headers)
        assert r.status_code == 200
        txs = r.json()
        for t in txs:
            assert t["created_at"].startswith("2025")

    def test_filter_by_month(self, admin_headers):
        # find a month that has transactions
        r = requests.get(f"{BASE_URL}/api/transactions?limit=1", headers=admin_headers)
        txs = r.json()
        if not txs:
            pytest.skip("no transactions")
        ym = txs[0]["created_at"][:7]
        r2 = requests.get(f"{BASE_URL}/api/transactions?date={ym}&limit=2000", headers=admin_headers)
        assert r2.status_code == 200
        for t in r2.json():
            assert t["created_at"].startswith(ym)

    def test_filter_by_date(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/transactions?limit=1", headers=admin_headers)
        txs = r.json()
        if not txs:
            pytest.skip("no transactions")
        ymd = txs[0]["created_at"][:10]
        r2 = requests.get(f"{BASE_URL}/api/transactions?date={ymd}&limit=2000", headers=admin_headers)
        assert r2.status_code == 200
        for t in r2.json():
            assert t["created_at"].startswith(ymd)


# ---------- Transaction delete restores stock (bulk delete uses per-id delete) ----------
class TestBulkDeleteViaIndividualDeletes:
    def test_create_and_delete_restores_stock(self, admin_headers):
        prods = requests.get(f"{BASE_URL}/api/products", headers=admin_headers).json()
        target = next((p for p in prods if p["stok"] >= 2 and not p.get("is_bundle")), None)
        if not target:
            pytest.skip("no suitable product")
        before = target["stok"]
        tx_ids = []
        for _ in range(2):
            tr = requests.post(f"{BASE_URL}/api/transactions", headers=admin_headers, json={
                "items": [{"product_id": target["id"], "name": target["name"], "qty": 1, "harga": target["harga_jual"]}],
                "payment_method": "Tunai", "discount": 0, "customer_name": "TEST_bulk",
            })
            assert tr.status_code == 200, tr.text
            tx_ids.append(tr.json()["id"])
        after_create = requests.get(f"{BASE_URL}/api/products", headers=admin_headers).json()
        p2 = next(p for p in after_create if p["id"] == target["id"])
        assert p2["stok"] == before - 2

        for tid in tx_ids:
            d = requests.delete(f"{BASE_URL}/api/transactions/{tid}", headers=admin_headers)
            assert d.status_code == 200

        after_del = requests.get(f"{BASE_URL}/api/products", headers=admin_headers).json()
        p3 = next(p for p in after_del if p["id"] == target["id"])
        assert p3["stok"] == before
