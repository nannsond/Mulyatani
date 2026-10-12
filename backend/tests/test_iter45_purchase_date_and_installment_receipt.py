"""Iter45: Purchase date input + Installment receipt (pay_transaction returns 'transaction')."""
import os, pytest, requests
from datetime import datetime

def _base():
    url = os.environ.get("REACT_APP_BACKEND_URL")
    if not url:
        try:
            with open("/app/frontend/.env") as f:
                for line in f:
                    if line.startswith("REACT_APP_BACKEND_URL="):
                        url = line.split("=", 1)[1].strip()
                        break
        except Exception:
            pass
    assert url, "REACT_APP_BACKEND_URL missing"
    return url.rstrip("/")

BASE_URL = _base()
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": "nannsond@gmail.com", "password": "admin123"})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def h(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def product_id(h):
    # create a product for use
    r = requests.post(f"{API}/products", json={
        "sku": "TEST_ITER45_SKU", "name": "TEST_ITER45_PROD", "category": "umum",
        "unit": "pcs", "harga_jual": 10000, "harga_beli": 5000, "stok": 0
    }, headers=h)
    assert r.status_code == 200, r.text
    pid = r.json()["id"]
    yield pid
    # cleanup
    requests.delete(f"{API}/products/{pid}", headers=h)


_created = {"purchases": [], "transactions": []}


def teardown_module(module):
    r = requests.post(f"{API}/auth/login", json={"email": "nannsond@gmail.com", "password": "admin123"})
    tok = r.json()["token"]
    hd = {"Authorization": f"Bearer {tok}"}
    for pid in _created["purchases"]:
        requests.delete(f"{API}/purchases/{pid}", headers=hd)
    for tid in _created["transactions"]:
        requests.delete(f"{API}/transactions/{tid}", headers=hd)


# ---------- Purchase date (POST /api/purchases) ----------
class TestPurchaseDate:
    def test_create_with_past_date(self, h, product_id):
        payload = {
            "supplier": "TEST_ITER45_SUP",
            "items": [{"product_id": product_id, "name": "TEST_ITER45_PROD", "qty": 2, "harga_beli": 5000}],
            "amount_paid": 10000, "note": "", "date": "2026-08-15"
        }
        r = requests.post(f"{API}/purchases", json=payload, headers=h)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["created_at"].startswith("2026-08-15")
        _created["purchases"].append(d["id"])

    def test_create_without_date_uses_now(self, h, product_id):
        payload = {
            "supplier": "TEST_ITER45_SUP",
            "items": [{"product_id": product_id, "name": "TEST_ITER45_PROD", "qty": 1, "harga_beli": 5000}],
            "amount_paid": 5000, "note": ""
        }
        r = requests.post(f"{API}/purchases", json=payload, headers=h)
        assert r.status_code == 200
        today = datetime.now().strftime("%Y-%m-%d")
        assert r.json()["created_at"].startswith(today)
        _created["purchases"].append(r.json()["id"])

    def test_create_invalid_date(self, h, product_id):
        payload = {
            "supplier": "TEST_ITER45_SUP",
            "items": [{"product_id": product_id, "name": "TEST_ITER45_PROD", "qty": 1, "harga_beli": 5000}],
            "amount_paid": 5000, "note": "", "date": "not-a-date"
        }
        r = requests.post(f"{API}/purchases", json=payload, headers=h)
        assert r.status_code == 400

    def test_list_purchases_by_month(self, h):
        r = requests.get(f"{API}/purchases?month=2026-08", headers=h)
        assert r.status_code == 200
        ids = [p["id"] for p in r.json()]
        assert _created["purchases"][0] in ids

    def test_update_purchase_date_changes_created_at(self, h, product_id):
        pid = _created["purchases"][0]
        payload = {
            "supplier": "TEST_ITER45_SUP",
            "items": [{"product_id": product_id, "name": "TEST_ITER45_PROD", "qty": 2, "harga_beli": 5000}],
            "amount_paid": 10000, "note": "", "date": "2026-07-10"
        }
        r = requests.put(f"{API}/purchases/{pid}", json=payload, headers=h)
        assert r.status_code == 200, r.text
        assert r.json()["created_at"].startswith("2026-07-10")

    def test_update_purchase_same_day_keeps_time(self, h, product_id):
        pid = _created["purchases"][0]
        # fetch current time portion
        cur = requests.get(f"{API}/purchases?month=2026-07", headers=h).json()
        orig = next(p for p in cur if p["id"] == pid)
        orig_ts = orig["created_at"]
        payload = {
            "supplier": "TEST_ITER45_SUP",
            "items": [{"product_id": product_id, "name": "TEST_ITER45_PROD", "qty": 2, "harga_beli": 5000}],
            "amount_paid": 10000, "note": "updated", "date": "2026-07-10"
        }
        r = requests.put(f"{API}/purchases/{pid}", json=payload, headers=h)
        assert r.status_code == 200
        assert r.json()["created_at"] == orig_ts  # same day -> time preserved

    def test_cash_pembelian_reflects_date(self, h):
        r = requests.get(f"{API}/reports/cash/day?date=2026-07-10", headers=h)
        assert r.status_code == 200, r.text
        txt = r.text
        # The purchase on 2026-07-10 should appear as a pembelian event
        assert "TEST_ITER45_SUP" in txt or "pembelian" in txt.lower()


# ---------- Installment receipt: pay_transaction returns 'transaction' ----------
class TestPayTransactionReturnsTx:
    @pytest.fixture(scope="class")
    def credit_tx_id(self, h, product_id):
        # create a credit (piutang) transaction with telepon
        payload = {
            "items": [{"product_id": product_id, "name": "TEST_ITER45_PROD",
                       "qty": 1, "harga": 100000}],
            "payment_method": "Tunai",
            "amount_paid": 30000,
            "customer_name": "TEST_ITER45_CUST",
            "telepon": "081234567890",
        }
        r = requests.post(f"{API}/transactions", json=payload, headers=h)
        assert r.status_code == 200, r.text
        tid = r.json()["id"]
        _created["transactions"].append(tid)
        return tid

    def test_pay_returns_transaction_object(self, h, credit_tx_id):
        r = requests.post(f"{API}/transactions/{credit_tx_id}/pay",
                          json={"amount": 20000, "date": "2026-10-05"}, headers=h)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "transaction" in body, body
        tx = body["transaction"]
        assert tx["id"] == credit_tx_id
        assert "invoice_no" in tx and tx["invoice_no"]
        assert tx["total"] == 100000
        assert tx["amount_paid"] == 50000
        assert isinstance(tx["payments"], list) and len(tx["payments"]) >= 1
        last = tx["payments"][-1]
        assert last["amount"] == 20000
        assert last["date"].startswith("2026-10-05")

    def test_second_pay_appends(self, h, credit_tx_id):
        r = requests.post(f"{API}/transactions/{credit_tx_id}/pay",
                          json={"amount": 50000, "date": "2026-10-06"}, headers=h)
        assert r.status_code == 200
        tx = r.json()["transaction"]
        assert len(tx["payments"]) >= 2
        assert tx["amount_paid"] == 100000
        assert tx["status"] == "lunas"
