"""Iteration 32: shipping rates, product berat, channel fees without free-shipping, ecom ongkir finalize."""
import os
import pytest
import requests
from pathlib import Path


def _load_frontend_env():
    env_path = Path("/app/frontend/.env")
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip()
    return None


BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _load_frontend_env()).rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "nannsond@gmail.com", "password": "admin123"}
KASIR = {"email": "kasir@tokotani.com", "password": "kasir123"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN)


@pytest.fixture(scope="module")
def kasir_token():
    return _login(KASIR)


def _h(t):
    return {"Authorization": f"Bearer {t}"}


# -- Channel fees must NOT include free-shipping/ongkir components --
class TestChannelFees:
    def test_fee_defaults_no_ongkir(self, admin_token):
        r = requests.get(f"{API}/channels/fee-defaults", headers=_h(admin_token), timeout=30)
        assert r.status_code == 200
        data = r.json()
        for ch in ["Shopee", "Tokopedia", "Lazada", "TikTok Shop"]:
            assert ch in data, f"missing {ch}"
            labels = [f["label"].lower() for f in data[ch]]
            for lbl in labels:
                assert "ongkir" not in lbl and "shipping" not in lbl and "xtra" not in lbl, f"{ch} has {lbl}"
            # must only include admin/komisi + biaya proses pesanan
            assert len(data[ch]) == 2

    def test_channels_fees_no_ongkir(self, admin_token):
        r = requests.get(f"{API}/channels", headers=_h(admin_token), timeout=30)
        assert r.status_code == 200
        chs = r.json()
        found = {c["name"]: c for c in chs}
        for name in ["Shopee", "Tokopedia", "Lazada", "TikTok Shop"]:
            assert name in found
            for f in found[name].get("fees", []):
                lbl = f["label"].lower()
                assert "ongkir" not in lbl and "shipping" not in lbl and "xtra" not in lbl


# -- Shipping rates CRUD --
class TestShippingRates:
    def test_kasir_cannot_set(self, kasir_token):
        r = requests.post(f"{API}/shipping/rates", headers=_h(kasir_token),
                          json={"rates": [{"daerah": "X", "tarif_per_kg": 1}], "min_kg": 1}, timeout=30)
        assert r.status_code == 403

    def test_admin_set_and_get(self, admin_token):
        payload = {
            "rates": [
                {"daerah": "Jawa Timur", "tarif_per_kg": 8000},
                {"daerah": "Jawa Tengah", "tarif_per_kg": 10000},
                {"daerah": "Luar Jawa", "tarif_per_kg": 25000},
                {"daerah": "", "tarif_per_kg": 5000},  # blank -> ignored
                {"daerah": "jawa timur", "tarif_per_kg": 9999},  # dup -> ignored
            ],
            "min_kg": 1,
        }
        r = requests.post(f"{API}/shipping/rates", headers=_h(admin_token), json=payload, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        names = [x["daerah"] for x in data["rates"]]
        assert names == ["Jawa Timur", "Jawa Tengah", "Luar Jawa"]
        assert data["min_kg"] == 1

        g = requests.get(f"{API}/shipping/rates", headers=_h(admin_token), timeout=30)
        assert g.status_code == 200
        gd = g.json()
        assert [x["daerah"] for x in gd["rates"]] == ["Jawa Timur", "Jawa Tengah", "Luar Jawa"]
        assert gd["min_kg"] == 1

    def test_kasir_can_get(self, kasir_token):
        r = requests.get(f"{API}/shipping/rates", headers=_h(kasir_token), timeout=30)
        assert r.status_code == 200


# -- Product berat --
class TestProductBerat:
    def test_set_berat_on_contoh_products(self, admin_token):
        r = requests.get(f"{API}/products", headers=_h(admin_token), timeout=30)
        assert r.status_code == 200
        prods = r.json()
        mapping = {"CONTOH-001": 1, "CONTOH-002": 1, "CONTOH-003": 0.05, "CONTOH-004": 0.12, "CONTOH-005": 0.5}
        updated_any = False
        for p in prods:
            if p.get("sku") in mapping:
                payload = {
                    "sku": p["sku"],
                    "name": p.get("name"),
                    "category": p.get("category"),
                    "unit": p.get("unit", "pcs"),
                    "harga_beli": p.get("harga_beli", 0),
                    "harga_jual": p.get("harga_jual", 0),
                    "harga_reseller": p.get("harga_reseller", 0),
                    "harga_online": p.get("harga_online", 0),
                    "harga_channel": p.get("harga_channel", {}),
                    "stok": p.get("stok", 0),
                    "stok_minimal": p.get("stok_minimal", 5),
                    "berat": mapping[p["sku"]],
                }
                pr = requests.put(f"{API}/products/{p['id']}", headers=_h(admin_token), json=payload, timeout=30)
                assert pr.status_code == 200, pr.text
                assert pr.json().get("berat") == mapping[p["sku"]]
                updated_any = True
        assert updated_any, "No CONTOH products found"

        # verify via GET
        r2 = requests.get(f"{API}/products", headers=_h(admin_token), timeout=30)
        p_by_sku = {p["sku"]: p for p in r2.json()}
        for sku, b in mapping.items():
            assert p_by_sku[sku]["berat"] == b

    def test_bundle_berat_sum(self, admin_token):
        r = requests.get(f"{API}/bundles", headers=_h(admin_token), timeout=30)
        assert r.status_code == 200
        for b in r.json():
            # recompute from components
            prods = requests.get(f"{API}/products", headers=_h(admin_token), timeout=30).json()
            pmap = {p["id"]: p for p in prods}
            expected = 0.0
            for c in b.get("components", []):
                p = pmap.get(c.get("product_id"))
                if p:
                    expected += (c.get("qty", 0) or 0) * (p.get("berat", 0) or 0)
            assert abs((b.get("berat", 0) or 0) - expected) < 1e-6, f"Bundle {b.get('nama')} berat mismatch"


# -- Ecom sale with ongkir estimate and finalize --
class TestEcomOngkir:
    created_id = None

    def test_create_sale_with_ongkir_estimate(self, admin_token):
        # pick CONTOH-001 (berat=1)
        prods = requests.get(f"{API}/products", headers=_h(admin_token), timeout=30).json()
        p = next((x for x in prods if x["sku"] == "CONTOH-001"), None)
        assert p, "CONTOH-001 required"
        payload = {
            "channel": "Shopee",
            "items": [{"product_id": p["id"], "name": p.get("name", "CONTOH-001"), "qty": 2, "harga": p.get("harga_jual", 10000), "is_bundle": False}],
            "admin_fee": 1000,
            "fee_breakdown": [],
            "ongkir": 16000,  # estimate = ceil(2*1)*8000 = 16000
            "biaya_lain": 0,
            "customer_name": "TEST_CUST",
            "order_no": "TEST-ORD-32",
            "daerah": "Jawa Timur",
            "berat_total": 2.0,
        }
        r = requests.post(f"{API}/ecommerce/sales", headers=_h(admin_token), json=payload, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["ongkir"] == 16000
        assert d["daerah"] == "Jawa Timur"
        assert d["berat_total"] == 2.0
        assert d["ongkir_final"] is False
        assert d["total_fee"] == 1000 + 16000 + 0
        TestEcomOngkir.created_id = d["id"]

    def test_kasir_cannot_finalize(self, kasir_token):
        assert TestEcomOngkir.created_id
        r = requests.put(f"{API}/ecommerce/sales/{TestEcomOngkir.created_id}/ongkir",
                         headers=_h(kasir_token), json={"ongkir": 15000}, timeout=30)
        assert r.status_code == 403

    def test_negative_ongkir_rejected(self, admin_token):
        assert TestEcomOngkir.created_id
        r = requests.put(f"{API}/ecommerce/sales/{TestEcomOngkir.created_id}/ongkir",
                         headers=_h(admin_token), json={"ongkir": -5}, timeout=30)
        assert r.status_code == 400

    def test_finalize_recalcs(self, admin_token):
        assert TestEcomOngkir.created_id
        # get laba_kotor + admin_fee first
        lst = requests.get(f"{API}/ecommerce/sales", headers=_h(admin_token), timeout=30).json()
        row = next(x for x in lst if x["id"] == TestEcomOngkir.created_id)
        laba_kotor = row["laba_kotor"]
        admin_fee = row["admin_fee"]
        biaya_lain = row.get("biaya_lain", 0)

        r = requests.put(f"{API}/ecommerce/sales/{TestEcomOngkir.created_id}/ongkir",
                         headers=_h(admin_token), json={"ongkir": 17500}, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["ok"] is True
        assert d["ongkir"] == 17500
        assert d["ongkir_final"] is True
        assert d["total_fee"] == admin_fee + 17500 + biaya_lain
        assert abs(d["laba_bersih"] - (laba_kotor - d["total_fee"])) < 1e-6

        # verify persisted
        lst2 = requests.get(f"{API}/ecommerce/sales", headers=_h(admin_token), timeout=30).json()
        row2 = next(x for x in lst2 if x["id"] == TestEcomOngkir.created_id)
        assert row2["ongkir"] == 17500 and row2["ongkir_final"] is True

    def test_cleanup(self, admin_token):
        if TestEcomOngkir.created_id:
            r = requests.delete(f"{API}/ecommerce/sales/{TestEcomOngkir.created_id}",
                                headers=_h(admin_token), timeout=30)
            assert r.status_code in (200, 204)
