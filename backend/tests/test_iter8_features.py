"""
Iteration 8 backend tests: status lifecycle gating, refund stock handling,
RBAC, channels CRUD, bulk Excel import, per-channel targets.
"""
import os
import pytest
import requests
from datetime import datetime

def _load_frontend_env():
    try:
        with open("/app/frontend/.env") as f:
            for ln in f:
                if ln.strip().startswith("REACT_APP_BACKEND_URL="):
                    return ln.strip().split("=", 1)[1]
    except Exception:
        pass
    return None

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _load_frontend_env()).rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "nannsond@gmail.com", "password": "T0k0Mulya#Tani2026"}
KASIR = {"email": "kasir@tokotani.com", "password": "Kasir#Mulya2026"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_h():
    return {"Authorization": f"Bearer {_login(ADMIN)}"}


@pytest.fixture(scope="module")
def kasir_h():
    return {"Authorization": f"Bearer {_login(KASIR)}"}


@pytest.fixture(scope="module")
def product(admin_h):
    r = requests.get(f"{API}/products", headers=admin_h, timeout=15)
    assert r.status_code == 200
    prods = r.json()
    p = next((x for x in prods if x["stok"] >= 5), prods[0])
    return p


@pytest.fixture(scope="module")
def product_refund(admin_h):
    """Separate product for refund tests to avoid parallel-worker stock races."""
    r = requests.get(f"{API}/products", headers=admin_h, timeout=15)
    prods = [x for x in r.json() if x["stok"] >= 5]
    return prods[-1] if len(prods) > 1 else prods[0]


# ---------- Channels CRUD ----------
class TestChannels:
    def test_list_defaults(self, admin_h):
        r = requests.get(f"{API}/channels", headers=admin_h, timeout=15)
        assert r.status_code == 200
        names = [c["name"] for c in r.json()]
        for n in ["Shopee", "Tokopedia", "Lazada", "TikTok Shop"]:
            assert n in names

    def test_add_duplicate_and_toggle_delete(self, admin_h):
        unique = f"TESTCH-{datetime.utcnow().strftime('%H%M%S')}"
        # add
        r = requests.post(f"{API}/channels", headers=admin_h, json={"name": unique, "color": "#111111"}, timeout=15)
        assert r.status_code == 200, r.text
        # duplicate
        r2 = requests.post(f"{API}/channels", headers=admin_h, json={"name": unique}, timeout=15)
        assert r2.status_code == 400
        # toggle inactive
        r3 = requests.put(f"{API}/channels/{unique}", headers=admin_h, json={"active": False}, timeout=15)
        assert r3.status_code == 200
        assert any(c["name"] == unique and c["active"] is False for c in r3.json()["list"])
        # delete
        r4 = requests.delete(f"{API}/channels/{unique}", headers=admin_h, timeout=15)
        assert r4.status_code == 200
        assert all(c["name"] != unique for c in r4.json()["list"])

    def test_kasir_cannot_manage_channels(self, kasir_h):
        r = requests.post(f"{API}/channels", headers=kasir_h, json={"name": "KasirCh"}, timeout=15)
        assert r.status_code == 403
        r2 = requests.put(f"{API}/channels/Shopee", headers=kasir_h, json={"active": True}, timeout=15)
        assert r2.status_code == 403
        r3 = requests.delete(f"{API}/channels/Shopee", headers=kasir_h, timeout=15)
        assert r3.status_code == 403


# ---------- Status gating + report integration ----------
class TestStatusGating:
    def test_lifecycle_and_report_merging(self, admin_h, product):
        now = datetime.utcnow()
        year, month = now.year, now.month

        # baseline monthly report
        r0 = requests.get(f"{API}/reports/monthly", headers=admin_h, params={"year": year, "month": month}, timeout=20)
        assert r0.status_code == 200
        base = r0.json()["summary"]
        base_omzet = base["total_omzet"]
        base_fee = base.get("biaya_marketplace", 0)
        base_laba_bersih = base["laba_bersih"]

        # create sale default Diproses
        payload = {
            "channel": "Shopee",
            "items": [{"product_id": product["id"] if "id" in product else product["_id"],
                       "name": product["name"], "qty": 1, "harga": 120000}],
            "admin_fee": 10000, "ongkir": 0, "biaya_lain": 0,
        }
        r = requests.post(f"{API}/ecommerce/sales", headers=admin_h, json=payload, timeout=15)
        assert r.status_code == 200, r.text
        sale = r.json()
        sid = sale["id"]
        assert sale["status"] == "Diproses"

        # Diproses should NOT change monthly totals
        r1 = requests.get(f"{API}/reports/monthly", headers=admin_h, params={"year": year, "month": month}, timeout=20)
        s1 = r1.json()["summary"]
        assert s1["total_omzet"] == base_omzet, "Diproses must not be merged"
        assert s1.get("biaya_marketplace", 0) == base_fee

        # transition to Selesai
        r2 = requests.put(f"{API}/ecommerce/sales/{sid}/status", headers=admin_h,
                          json={"status": "Selesai"}, timeout=15)
        assert r2.status_code == 200
        assert r2.json()["status"] == "Selesai"

        r3 = requests.get(f"{API}/reports/monthly", headers=admin_h, params={"year": year, "month": month}, timeout=20)
        s3 = r3.json()["summary"]
        assert s3["total_omzet"] == base_omzet + 120000, f"Expected +120000, got {s3['total_omzet'] - base_omzet}"
        assert s3.get("biaya_marketplace", 0) == base_fee + 10000
        # laba_bersih should subtract marketplace fee relative to baseline change
        # (profit delta = 120000 - hpp - 10000; we only verify fee gets subtracted properly)
        assert s3["laba_bersih"] == s3["total_laba"] - s3["total_pengeluaran"] - s3["biaya_marketplace"]

        # cleanup
        requests.delete(f"{API}/ecommerce/sales/{sid}", headers=admin_h, timeout=15)

    def test_daily_and_yearly_also_gate(self, admin_h, product):
        today = datetime.utcnow().strftime("%Y-%m-%d")
        year = datetime.utcnow().year

        d0 = requests.get(f"{API}/reports/daily", headers=admin_h, params={"date": today}, timeout=20).json()["summary"]
        y0 = requests.get(f"{API}/reports/yearly", headers=admin_h, params={"year": year}, timeout=25).json()["summary"]

        payload = {
            "channel": "Tokopedia",
            "items": [{"product_id": product["id"] if "id" in product else product["_id"],
                       "name": product["name"], "qty": 1, "harga": 50000}],
            "admin_fee": 5000,
        }
        r = requests.post(f"{API}/ecommerce/sales", headers=admin_h, json=payload, timeout=15)
        sid = r.json()["id"]

        d1 = requests.get(f"{API}/reports/daily", headers=admin_h, params={"date": today}, timeout=20).json()["summary"]
        assert d1["total_omzet"] == d0["total_omzet"], "Diproses must be excluded from daily"

        requests.put(f"{API}/ecommerce/sales/{sid}/status", headers=admin_h, json={"status": "Selesai"}, timeout=15)

        d2 = requests.get(f"{API}/reports/daily", headers=admin_h, params={"date": today}, timeout=20).json()["summary"]
        y2 = requests.get(f"{API}/reports/yearly", headers=admin_h, params={"year": year}, timeout=25).json()["summary"]
        assert d2["total_omzet"] == d0["total_omzet"] + 50000
        assert d2["biaya_marketplace"] == d0.get("biaya_marketplace", 0) + 5000
        assert y2["total_omzet"] == y0["total_omzet"] + 50000
        assert y2["biaya_marketplace"] == y0.get("biaya_marketplace", 0) + 5000

        requests.delete(f"{API}/ecommerce/sales/{sid}", headers=admin_h, timeout=15)


# ---------- Refund stock handling ----------
class TestRefund:
    def _create(self, admin_h, product, qty=2):
        pid = product["id"] if "id" in product else product["_id"]
        payload = {"channel": "Lazada",
                   "items": [{"product_id": pid, "name": product["name"], "qty": qty, "harga": 10000}]}
        r = requests.post(f"{API}/ecommerce/sales", headers=admin_h, json=payload, timeout=15)
        return r.json()["id"], pid

    def _stok(self, admin_h, pid):
        r = requests.get(f"{API}/products", headers=admin_h, timeout=15)
        return next(p["stok"] for p in r.json() if (p.get("id") or p.get("_id")) == pid)

    def test_restore_true_increases_stock_once(self, admin_h, product_refund):
        sid, pid = self._create(admin_h, product_refund, qty=2)
        after_create = self._stok(admin_h, pid)
        r = requests.put(f"{API}/ecommerce/sales/{sid}/status", headers=admin_h,
                         json={"status": "Dikembalikan", "restore_stock": True}, timeout=15)
        assert r.status_code == 200
        assert r.json().get("stock_restored") is True
        after_refund = self._stok(admin_h, pid)
        assert after_refund == after_create + 2
        # second call must NOT double restore
        r2 = requests.put(f"{API}/ecommerce/sales/{sid}/status", headers=admin_h,
                          json={"status": "Dikembalikan", "restore_stock": True}, timeout=15)
        assert r2.status_code == 200
        assert self._stok(admin_h, pid) == after_refund
        requests.delete(f"{API}/ecommerce/sales/{sid}", headers=admin_h, timeout=15)

    def test_restore_false_does_not_restore(self, admin_h, product_refund):
        sid, pid = self._create(admin_h, product_refund, qty=1)
        after_create = self._stok(admin_h, pid)
        r = requests.put(f"{API}/ecommerce/sales/{sid}/status", headers=admin_h,
                         json={"status": "Dikembalikan", "restore_stock": False}, timeout=15)
        assert r.status_code == 200
        assert self._stok(admin_h, pid) == after_create
        # excluded from monthly
        now = datetime.utcnow()
        rep = requests.get(f"{API}/reports/monthly", headers=admin_h,
                           params={"year": now.year, "month": now.month}, timeout=20).json()["summary"]
        # Dikembalikan sale with 1*10000 omzet must not be in totals - no direct check,
        # but ecom reports status_counts should include it
        er = requests.get(f"{API}/ecommerce/reports", headers=admin_h,
                          params={"mode": "bulanan", "year": now.year, "month": now.month}, timeout=20).json()
        assert "Dikembalikan" in er["status_counts"]
        requests.delete(f"{API}/ecommerce/sales/{sid}", headers=admin_h, timeout=15)


# ---------- RBAC ----------
class TestRBAC:
    def test_kasir_can_create_cannot_delete_status(self, admin_h, kasir_h, product):
        pid = product["id"] if "id" in product else product["_id"]
        payload = {"channel": "Shopee",
                   "items": [{"product_id": pid, "name": product["name"], "qty": 1, "harga": 5000}]}
        r = requests.post(f"{API}/ecommerce/sales", headers=kasir_h, json=payload, timeout=15)
        assert r.status_code == 200, r.text
        sid = r.json()["id"]
        # kasir cannot delete
        rd = requests.delete(f"{API}/ecommerce/sales/{sid}", headers=kasir_h, timeout=15)
        assert rd.status_code == 403
        # kasir cannot change status
        rs = requests.put(f"{API}/ecommerce/sales/{sid}/status", headers=kasir_h,
                          json={"status": "Selesai"}, timeout=15)
        assert rs.status_code == 403
        # kasir cannot set target
        rt = requests.post(f"{API}/ecommerce/targets", headers=kasir_h,
                           json={"channel": "Shopee", "year": 2026, "month": 10, "target_omzet": 1000}, timeout=15)
        assert rt.status_code == 403
        # cleanup via admin
        requests.delete(f"{API}/ecommerce/sales/{sid}", headers=admin_h, timeout=15)


# ---------- Bulk import ----------
class TestBulkImport:
    def test_mixed_rows(self, admin_h, product):
        rows = [
            {"channel": "Shopee", "sku": product["sku"], "qty": 1, "harga": 20000, "admin_fee": 1000},
            {"channel": "BadChan", "sku": product["sku"], "qty": 1, "harga": 20000},
            {"channel": "Shopee", "sku": "NOPE-SKU-XYZ", "qty": 1, "harga": 20000},
        ]
        r = requests.post(f"{API}/ecommerce/sales/bulk", headers=admin_h, json={"rows": rows}, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["created"] == 1
        assert len(data["errors"]) == 2
        # verify created sale defaults Diproses
        now = datetime.utcnow()
        prefix = now.strftime("%Y-%m")
        lst = requests.get(f"{API}/ecommerce/sales", headers=admin_h, params={"month": prefix}, timeout=15).json()
        latest = [s for s in lst if s.get("ecom_no") and s.get("omzet") == 20000][:1]
        if latest:
            assert latest[0]["status"] == "Diproses"
            requests.delete(f"{API}/ecommerce/sales/{latest[0]['id']}", headers=admin_h, timeout=15)

    def test_kasir_cannot_bulk(self, kasir_h, product):
        rows = [{"channel": "Shopee", "sku": product["sku"], "qty": 1, "harga": 10000}]
        r = requests.post(f"{API}/ecommerce/sales/bulk", headers=kasir_h, json={"rows": rows}, timeout=15)
        assert r.status_code == 403


# ---------- Targets ----------
class TestTargets:
    def test_set_and_get(self, admin_h):
        now = datetime.utcnow()
        y, m = now.year, now.month
        r = requests.post(f"{API}/ecommerce/targets", headers=admin_h,
                          json={"channel": "Shopee", "year": y, "month": m, "target_omzet": 999999}, timeout=15)
        assert r.status_code == 200
        g = requests.get(f"{API}/ecommerce/targets", headers=admin_h,
                         params={"year": y, "month": m}, timeout=15).json()
        assert g.get("Shopee") == 999999
        # ecom_reports monthly includes target per channel
        er = requests.get(f"{API}/ecommerce/reports", headers=admin_h,
                         params={"mode": "bulanan", "year": y, "month": m}, timeout=20).json()
        shopee = next((c for c in er["channels"] if c["channel"] == "Shopee"), None)
        assert shopee is not None
        assert shopee.get("target") == 999999


# ---------- Invalid channel ----------
class TestInvalidChannel:
    def test_create_unknown_channel_400(self, admin_h, product):
        pid = product["id"] if "id" in product else product["_id"]
        payload = {"channel": "DoesNotExist",
                   "items": [{"product_id": pid, "name": product["name"], "qty": 1, "harga": 1000}]}
        r = requests.post(f"{API}/ecommerce/sales", headers=admin_h, json=payload, timeout=15)
        assert r.status_code == 400
