"""Iteration 5 feature tests: Pembelian/Hutang, Piutang/POS Diskon, Pengeluaran, Laba Bersih."""
import os
from datetime import datetime, timezone

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
ADMIN = {"email": "nannsond@gmail.com", "password": "admin123"}
KASIR = {"email": "kasir@tokotani.com", "password": "kasir123"}


def _login(creds):
    r = requests.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=15)
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
    r = requests.get(f"{BASE_URL}/api/products", headers=admin_h)
    assert r.status_code == 200
    return r.json()[0]


# ---------------- Pembelian ----------------
class TestPurchases:
    def test_create_purchase_fully_paid_increases_stock(self, admin_h, product):
        stok_before = product["stok"]
        harga_beli_new = float(product["harga_beli"]) + 1  # bump to verify update
        payload = {
            "supplier": "TEST_Supplier_A",
            "items": [{"product_id": product["id"], "name": product["name"],
                       "qty": 3, "harga_beli": harga_beli_new}],
            "note": "pytest purchase"
        }
        r = requests.post(f"{BASE_URL}/api/purchases", json=payload, headers=admin_h)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["status"] == "lunas"
        assert data["total"] == 3 * harga_beli_new
        assert data["po_no"].startswith("PO-")

        # verify stock increased + harga_beli updated
        r2 = requests.get(f"{BASE_URL}/api/products", headers=admin_h)
        prod_now = next(p for p in r2.json() if p["id"] == product["id"])
        assert prod_now["stok"] == stok_before + 3
        assert prod_now["harga_beli"] == harga_beli_new

    def test_create_purchase_partial_appears_in_hutang(self, admin_h, product):
        payload = {
            "supplier": "TEST_Supplier_B",
            "items": [{"product_id": product["id"], "name": product["name"],
                       "qty": 2, "harga_beli": 10000}],
            "amount_paid": 5000,
        }
        r = requests.post(f"{BASE_URL}/api/purchases", json=payload, headers=admin_h)
        assert r.status_code == 200
        pid = r.json()["id"]
        assert r.json()["status"] == "sebagian"
        assert r.json()["total"] == 20000
        assert r.json()["amount_paid"] == 5000

        # appears in hutang
        h = requests.get(f"{BASE_URL}/api/hutang", headers=admin_h).json()
        row = next((x for x in h if x["id"] == pid), None)
        assert row is not None
        assert row["sisa"] == 15000
        assert row["status"] == "sebagian"

        # Pay the rest -> lunas
        pay = requests.post(f"{BASE_URL}/api/purchases/{pid}/pay",
                            json={"amount": 15000}, headers=admin_h)
        assert pay.status_code == 200
        assert pay.json()["status"] == "lunas"
        assert pay.json()["amount_paid"] == 20000

        # no longer in hutang
        h2 = requests.get(f"{BASE_URL}/api/hutang", headers=admin_h).json()
        assert all(x["id"] != pid for x in h2)

    def test_list_purchases_month_filter(self, admin_h):
        now = datetime.now(timezone.utc)
        month = f"{now.year}-{now.month:02d}"
        r = requests.get(f"{BASE_URL}/api/purchases?month={month}", headers=admin_h)
        assert r.status_code == 200
        assert isinstance(r.json(), list)
        # we created at least 2 this month
        assert len(r.json()) >= 2


# ---------------- Piutang + POS discount ----------------
class TestPiutangAndDiscount:
    def test_pos_checkout_with_discount_and_partial_payment(self, kasir_h, product):
        unit = float(product["harga_jual"])
        payload = {
            "items": [{"product_id": product["id"], "name": product["name"],
                       "qty": 2, "harga": unit}],
            "payment_method": "Tunai",
            "discount": 5000,
            "discount_reason": "TEST diskon",
            "customer_name": "TEST_Customer",
            "amount_paid": 1000,
        }
        r = requests.post(f"{BASE_URL}/api/transactions", json=payload, headers=kasir_h)
        assert r.status_code == 200, r.text
        tx = r.json()
        subtotal = 2 * unit
        assert tx["subtotal"] == subtotal
        assert tx["discount"] == 5000
        assert tx["total"] == subtotal - 5000
        assert tx["status"] == "sebagian"
        assert tx["customer_name"] == "TEST_Customer"
        tid = tx["id"]

        # listed in piutang
        pi = requests.get(f"{BASE_URL}/api/piutang", headers=kasir_h).json()
        row = next((x for x in pi if x["id"] == tid), None)
        assert row is not None
        assert row["sisa"] == tx["total"] - 1000

        # pay rest
        pay = requests.post(f"{BASE_URL}/api/transactions/{tid}/pay",
                            json={"amount": tx["total"]}, headers=kasir_h)
        assert pay.status_code == 200
        assert pay.json()["status"] == "lunas"


# ---------------- Pengeluaran ----------------
class TestExpenses:
    def test_create_list_delete_expense(self, admin_h):
        now = datetime.now(timezone.utc)
        today = now.strftime("%Y-%m-%d")
        month = now.strftime("%Y-%m")
        payload = {"category": "TEST_Operasional", "amount": 12345,
                   "note": "pytest expense", "date": today}
        r = requests.post(f"{BASE_URL}/api/expenses", json=payload, headers=admin_h)
        assert r.status_code == 200
        eid = r.json()["id"]
        assert r.json()["amount"] == 12345
        assert r.json()["created_at"].startswith(today)

        # list w/ month filter
        lst = requests.get(f"{BASE_URL}/api/expenses?month={month}", headers=admin_h).json()
        assert any(e["id"] == eid for e in lst)

        # delete
        d = requests.delete(f"{BASE_URL}/api/expenses/{eid}", headers=admin_h)
        assert d.status_code == 200
        lst2 = requests.get(f"{BASE_URL}/api/expenses?month={month}", headers=admin_h).json()
        assert all(e["id"] != eid for e in lst2)


# ---------------- Laba Bersih in reports ----------------
class TestLabaBersih:
    def test_monthly_report_has_pengeluaran_and_laba_bersih(self, admin_h):
        now = datetime.now(timezone.utc)
        r = requests.get(f"{BASE_URL}/api/reports/monthly?year={now.year}&month={now.month}",
                         headers=admin_h)
        assert r.status_code == 200
        s = r.json()["summary"]
        assert "total_pengeluaran" in s
        assert "laba_bersih" in s
        assert s["laba_bersih"] == s["total_laba"] - s["total_pengeluaran"]

    def test_yearly_report_has_pengeluaran_and_laba_bersih(self, admin_h):
        now = datetime.now(timezone.utc)
        r = requests.get(f"{BASE_URL}/api/reports/yearly?year={now.year}", headers=admin_h)
        assert r.status_code == 200
        s = r.json()["summary"]
        assert "total_pengeluaran" in s
        assert "laba_bersih" in s
        assert s["laba_bersih"] == s["total_laba"] - s["total_pengeluaran"]


# ---------------- Role gating regression ----------------
class TestRoleGating:
    def test_kasir_cannot_set_store_info(self, kasir_h):
        r = requests.post(f"{BASE_URL}/api/settings/info", json={"store_name": "x"}, headers=kasir_h)
        assert r.status_code == 403

    def test_kasir_can_create_purchase_and_expense(self, kasir_h, product):
        # purchase (any auth per server code)
        r1 = requests.post(f"{BASE_URL}/api/purchases", json={
            "supplier": "TEST_SupKasir",
            "items": [{"product_id": product["id"], "name": product["name"],
                       "qty": 1, "harga_beli": 1000}]
        }, headers=kasir_h)
        assert r1.status_code == 200
        # expense
        r2 = requests.post(f"{BASE_URL}/api/expenses", json={
            "category": "TEST_Kasir", "amount": 1000}, headers=kasir_h)
        assert r2.status_code == 200
        requests.delete(f"{BASE_URL}/api/expenses/{r2.json()['id']}", headers=kasir_h)
