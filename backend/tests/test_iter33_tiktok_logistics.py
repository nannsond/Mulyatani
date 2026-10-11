"""Iteration 33: TikTok Shop platform logistics (Biaya Layanan Logistik per Pesanan)."""
import os
import pytest
import requests
from pathlib import Path


def _load_env():
    env_path = Path("/app/frontend/.env")
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip()
    return None


BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _load_env()).rstrip("/")
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


# -- /api/shipping/rates returns platform_tables with TikTok Shop --
class TestShippingPlatformTables:
    def test_shape(self, admin_token):
        r = requests.get(f"{API}/shipping/rates", headers=_h(admin_token), timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert "platform_tables" in data
        pt = data["platform_tables"]
        assert "TikTok Shop" in pt, f"missing TikTok Shop; got keys {list(pt.keys())}"
        tbl = pt["TikTok Shop"]
        # 6 tiers
        assert len(tbl["tiers"]) == 6
        # 4 services with expected names and route counts
        services = {s["name"]: s for s in tbl["services"]}
        assert set(services.keys()) == {"Standar", "Ekonomi", "Kargo", "Instan & Sameday"}
        assert len(services["Standar"]["routes"]) == 13
        assert len(services["Ekonomi"]["routes"]) == 9
        assert len(services["Kargo"]["routes"]) == 13
        assert len(services["Instan & Sameday"]["routes"]) == 8

    def test_standar_jawa_selain_jakarta_fees(self, admin_token):
        r = requests.get(f"{API}/shipping/rates", headers=_h(admin_token), timeout=30)
        tbl = r.json()["platform_tables"]["TikTok Shop"]
        svc = next(s for s in tbl["services"] if s["name"] == "Standar")
        route = next(x for x in svc["routes"] if x["zona_a"] == "Jawa" and x["zona_b"] == "Jawa (Selain Jakarta)")
        assert route["fees"] == [990, 1090, 2220, 3030, 3540, 5060]

    def test_ekonomi_jakarta_all_null(self, admin_token):
        r = requests.get(f"{API}/shipping/rates", headers=_h(admin_token), timeout=30)
        tbl = r.json()["platform_tables"]["TikTok Shop"]
        svc = next(s for s in tbl["services"] if s["name"] == "Ekonomi")
        # per request: Ekonomi Jawa↔Jawa (Jakarta) all null
        route = next(x for x in svc["routes"] if x["zona_a"] == "Jawa" and x["zona_b"] == "Jawa (Jakarta)")
        assert all(f is None for f in route["fees"])

    def test_kargo_light_weights_na(self, admin_token):
        r = requests.get(f"{API}/shipping/rates", headers=_h(admin_token), timeout=30)
        tbl = r.json()["platform_tables"]["TikTok Shop"]
        svc = next(s for s in tbl["services"] if s["name"] == "Kargo")
        # Kargo typically N.A. for <=2kg across routes
        for route in svc["routes"]:
            assert route["fees"][0] is None
            assert route["fees"][1] is None

    def test_kasir_can_see_tables(self, kasir_token):
        r = requests.get(f"{API}/shipping/rates", headers=_h(kasir_token), timeout=30)
        assert r.status_code == 200
        assert "TikTok Shop" in r.json().get("platform_tables", {})


# -- TikTok Shop channel active? --
class TestTikTokChannel:
    def test_tiktok_shop_channel_exists(self, admin_token):
        r = requests.get(f"{API}/channels", headers=_h(admin_token), timeout=30)
        assert r.status_code == 200
        ch = next((c for c in r.json() if c["name"] == "TikTok Shop"), None)
        assert ch, "TikTok Shop channel missing"


# -- Create ecom sale on TikTok Shop with platform logistics daerah label --
class TestTikTokEcomSale:
    created_id = None

    def _ensure_tiktok_active(self, admin_token):
        r = requests.get(f"{API}/channels", headers=_h(admin_token), timeout=30)
        chs = r.json()
        ch = next((c for c in chs if c["name"] == "TikTok Shop"), None)
        assert ch
        if not ch.get("active"):
            # try activate
            payload = {"name": ch["name"], "color": ch.get("color", "#000"), "fees": ch.get("fees", []), "active": True}
            requests.put(f"{API}/channels/{ch['id']}", headers=_h(admin_token), json=payload, timeout=30)

    def test_create_sale_tiktok(self, admin_token):
        self._ensure_tiktok_active(admin_token)
        prods = requests.get(f"{API}/products", headers=_h(admin_token), timeout=30).json()
        p = next((x for x in prods if x.get("sku") == "CONTOH-001"), None)
        assert p, "CONTOH-001 (berat=1) required"
        # qty 1 => 1kg => tier 0 for Standar Jawa↔Jawa (Selain Jakarta) = 990
        payload = {
            "channel": "TikTok Shop",
            "items": [{"product_id": p["id"], "name": p.get("name"), "qty": 1,
                       "harga": p.get("harga_online") or p.get("harga_jual", 10000), "is_bundle": False}],
            "admin_fee": 500,
            "fee_breakdown": [],
            "ongkir": 990,
            "biaya_lain": 0,
            "customer_name": "TEST_TIKTOK",
            "order_no": "TEST-TTS-33",
            "daerah": "Standar · Jawa ↔ Jawa (Selain Jakarta)",
            "berat_total": 1.0,
        }
        r = requests.post(f"{API}/ecommerce/sales", headers=_h(admin_token), json=payload, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["channel"] == "TikTok Shop"
        assert d["ongkir"] == 990
        assert d["daerah"] == "Standar · Jawa ↔ Jawa (Selain Jakarta)"
        assert d["berat_total"] == 1.0
        assert d["ongkir_final"] is False
        TestTikTokEcomSale.created_id = d["id"]

    def test_finalize_still_works(self, admin_token):
        assert TestTikTokEcomSale.created_id
        r = requests.put(f"{API}/ecommerce/sales/{TestTikTokEcomSale.created_id}/ongkir",
                         headers=_h(admin_token), json={"ongkir": 1200}, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["ongkir"] == 1200 and d["ongkir_final"] is True

    def test_cleanup(self, admin_token):
        if TestTikTokEcomSale.created_id:
            r = requests.delete(f"{API}/ecommerce/sales/{TestTikTokEcomSale.created_id}",
                                headers=_h(admin_token), timeout=30)
            assert r.status_code in (200, 204)
