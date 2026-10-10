"""Iteration 14: Per-channel fee (potongan) policies"""
import os
import subprocess

import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://mulyatani-preview.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"

EXPECTED_DEFAULTS = {
    "Shopee": [
        {"label": "Biaya Administrasi", "type": "percent", "value": 8, "cap": 0},
        {"label": "Program Gratis Ongkir XTRA", "type": "percent", "value": 4, "cap": 40000},
        {"label": "Biaya Proses Pesanan", "type": "fixed", "value": 1250, "cap": 0},
    ],
    "Tokopedia": [
        {"label": "Komisi Platform", "type": "percent", "value": 6.5, "cap": 0},
        {"label": "Biaya Layanan (Program Xtra)", "type": "percent", "value": 4, "cap": 40000},
        {"label": "Biaya Proses Pesanan", "type": "fixed", "value": 1250, "cap": 0},
    ],
    "Lazada": [
        {"label": "Komisi Marketplace", "type": "percent", "value": 6, "cap": 0},
        {"label": "Free Shipping Max", "type": "percent", "value": 4, "cap": 20000},
        {"label": "Biaya Proses Pesanan", "type": "fixed", "value": 1250, "cap": 0},
    ],
    "TikTok Shop": [
        {"label": "Komisi Platform", "type": "percent", "value": 6.5, "cap": 0},
        {"label": "Biaya Layanan (Program Xtra)", "type": "percent", "value": 4, "cap": 40000},
        {"label": "Biaya Proses Pesanan", "type": "fixed", "value": 1250, "cap": 0},
    ],
}

@pytest.fixture(scope="session")
def admin_token():
    out = subprocess.check_output(
        ["python3", "-c",
         "import os,jwt;from dotenv import load_dotenv;load_dotenv('/app/backend/.env');"
         "from datetime import datetime,timedelta,timezone;"
         "print(jwt.encode({'sub':'6ac85c7524352b6e2314dcf9','email':'nannsond@gmail.com','role':'admin',"
         "'exp':datetime.now(timezone.utc)+timedelta(hours=3),'type':'access'},"
         "os.environ['JWT_SECRET'],algorithm='HS256'))"],
        text=True).strip()
    return out

@pytest.fixture(scope="session")
def kasir_token():
    r = requests.post(f"{API}/auth/login", json={"email": "kasir@tokotani.com", "password": "Kasir#Mulya2026"})
    assert r.status_code == 200, r.text
    return r.json()["token"]

@pytest.fixture
def admin_h(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}

@pytest.fixture
def kasir_h(kasir_token):
    return {"Authorization": f"Bearer {kasir_token}"}


# ------- Channels / fee defaults -------
def test_fee_defaults_endpoint(kasir_h):
    r = requests.get(f"{API}/channels/fee-defaults", headers=kasir_h)
    assert r.status_code == 200
    data = r.json()
    for name, fees in EXPECTED_DEFAULTS.items():
        assert name in data, f"missing {name}"
        for exp in fees:
            match = [f for f in data[name] if f["label"] == exp["label"]]
            assert match, f"{name}: missing fee {exp['label']}"
            m = match[0]
            assert m["type"] == exp["type"]
            assert float(m["value"]) == float(exp["value"])
            assert float(m.get("cap", 0)) == float(exp["cap"])


def test_channels_list_has_fees(admin_h):
    r = requests.get(f"{API}/channels", headers=admin_h)
    assert r.status_code == 200
    chans = r.json()
    by_name = {c["name"]: c for c in chans}
    for name in EXPECTED_DEFAULTS:
        assert name in by_name, f"channel {name} missing"
        assert "fees" in by_name[name]
        assert len(by_name[name]["fees"]) >= 1


def test_update_channel_fees_admin_only(admin_h, kasir_h):
    # kasir forbidden
    r = requests.put(f"{API}/channels/Shopee", json={"fees": EXPECTED_DEFAULTS["Shopee"]}, headers=kasir_h)
    assert r.status_code == 403

    # admin ok, invalid type filtered
    payload = {"fees": [
        {"label": "Biaya Administrasi", "type": "percent", "value": 8, "cap": 0},
        {"label": "Bogus", "type": "bogus", "value": 1, "cap": 0},  # should be filtered
        {"label": "", "type": "percent", "value": 1, "cap": 0},  # blank label filtered
        {"label": "Biaya Proses Pesanan", "type": "fixed", "value": 1250, "cap": 0},
    ]}
    r = requests.put(f"{API}/channels/Shopee", json=payload, headers=admin_h)
    assert r.status_code == 200, r.text
    shopee = next(c for c in r.json()["list"] if c["name"] == "Shopee")
    labels = [f["label"] for f in shopee["fees"]]
    assert "Bogus" not in labels
    assert "" not in labels
    assert "Biaya Administrasi" in labels


def test_restore_shopee_defaults(admin_h):
    r = requests.put(f"{API}/channels/Shopee",
                     json={"fees": EXPECTED_DEFAULTS["Shopee"]}, headers=admin_h)
    assert r.status_code == 200


def test_new_channel_fees_known_vs_unknown(admin_h):
    # Add a bogus channel (unknown name) -> fees []
    name = "TESTCH_UNKNOWN"
    r = requests.post(f"{API}/channels", json={"name": name, "color": "#000"}, headers=admin_h)
    assert r.status_code == 200
    chans = r.json()["list"]
    ch = next(c for c in chans if c["name"] == name)
    assert ch["fees"] == []
    # cleanup
    requests.delete(f"{API}/channels/{name}", headers=admin_h)


# ------- Bulk ecommerce with auto fee -------
def _ensure_test_product(admin_h):
    # find or create product with SKU TEST_FEE_SKU
    r = requests.get(f"{API}/products", headers=admin_h, params={"limit": 1000})
    assert r.status_code == 200
    prods = r.json() if isinstance(r.json(), list) else r.json().get("items", r.json())
    # Try find existing Cangkul Baja Super
    cang = None
    for p in prods:
        if p.get("name", "").lower().startswith("cangkul baja super"):
            cang = p; break
    if cang:
        # ensure stock
        if cang.get("stok", 0) < 20:
            requests.put(f"{API}/products/{cang['id']}", json={**{k: cang[k] for k in ['sku','name','category','unit','harga_beli','harga_jual','harga_reseller','harga_online','harga_channel','stok_minimal']}, 'stok': 50}, headers=admin_h)
        return cang
    # Create a test product
    payload = {"sku": "TEST_FEE_SKU", "name": "TEST Fee Product", "category": "Test",
               "unit": "pcs", "harga_beli": 50000, "harga_jual": 99000,
               "harga_reseller": 0, "harga_online": 99000, "harga_channel": {},
               "stok": 100, "stok_minimal": 1}
    r = requests.post(f"{API}/products", json=payload, headers=admin_h)
    assert r.status_code in (200, 201), r.text
    return r.json()


created_sale_ids = []


def test_bulk_auto_fee_shopee(admin_h):
    p = _ensure_test_product(admin_h)
    sku = p["sku"]
    rows = [
        {"channel": "Shopee", "sku": sku, "qty": 1, "harga": 99000, "admin_fee": 0},
        {"channel": "Shopee", "sku": sku, "qty": 1, "harga": 99000, "admin_fee": 5000},  # manual kept
    ]
    r = requests.post(f"{API}/ecommerce/sales/bulk", json={"rows": rows}, headers=admin_h)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["created"] == 2, body
    # verify via list
    r = requests.get(f"{API}/ecommerce/sales", headers=admin_h, params={"channel": "Shopee", "limit": 50})
    assert r.status_code == 200
    recent = [s for s in r.json() if s.get("omzet") == 99000][:2]
    assert len(recent) >= 2
    # Collect for cleanup
    for s in recent:
        created_sale_ids.append(s["id"])
    # auto fee: 7920+3960+1250 = 13130
    autos = [s for s in recent if s["admin_fee"] == 13130]
    manuals = [s for s in recent if s["admin_fee"] == 5000]
    assert autos, f"expected one row with auto fee 13130, got {[s['admin_fee'] for s in recent]}"
    assert manuals, "expected row with manual admin_fee=5000"


def test_create_ecom_sale_stores_fee_breakdown(admin_h):
    p = _ensure_test_product(admin_h)
    pid = p["id"]
    # cart item needs product_id
    payload = {
        "channel": "Shopee",
        "items": [{"product_id": pid, "name": p["name"], "qty": 1, "harga": 99000, "is_bundle": False}],
        "admin_fee": 13130,
        "fee_breakdown": [
            {"label": "Biaya Administrasi", "amount": 7920},
            {"label": "Program Gratis Ongkir XTRA", "amount": 3960},
            {"label": "Biaya Proses Pesanan", "amount": 1250},
        ],
        "ongkir": 0, "biaya_lain": 0,
        "customer_name": "TEST_CUST", "order_no": "TEST_ORD"
    }
    r = requests.post(f"{API}/ecommerce/sales", json=payload, headers=admin_h)
    assert r.status_code == 200, r.text
    doc = r.json()
    assert doc.get("fee_breakdown"), "fee_breakdown not stored"
    assert len(doc["fee_breakdown"]) == 3
    assert doc["admin_fee"] == 13130
    created_sale_ids.append(doc["id"])


def test_cleanup_test_sales(admin_h):
    for sid in created_sale_ids:
        requests.delete(f"{API}/ecommerce/sales/{sid}", headers=admin_h)
