"""Iteration 35: Commission split by kasir attendance (Dikirim/Selesai online sales).

Flow tested:
- /api/commission/settings get/post (admin), kasir forbidden on POST
- /api/commission/report?month=YYYY-MM pool math on ecommerce_sales with status Dikirim/Selesai
- Rows include only role=kasir users (admin excluded)
- Each kasir komisi = round(pool * hadir / total_hadir); total_hadir==0 -> all 0
- Status change from Diproses -> Dikirim includes sale in pool
- /api/payroll/report: kasir komisi matches commission split; admin komisi == 0

TEST data (ecommerce sales + attendance) is cleaned up at end.
"""
import os
import re
import pytest
import requests
from datetime import datetime, timezone, timedelta
from motor.motor_asyncio import AsyncIOMotorClient
import asyncio

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "nannsond@gmail.com"
ADMIN_PASS = "admin123"
KASIR_EMAIL = "kasir@tokotani.com"
KASIR_PASS = "kasir123"

WIB = timezone(timedelta(hours=7))
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")


def _login(email, pw):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=15)
    assert r.status_code == 200, f"Login failed {email}: {r.status_code} {r.text}"
    return r.json()["token"]


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN_EMAIL, ADMIN_PASS)


@pytest.fixture(scope="module")
def kasir_token():
    return _login(KASIR_EMAIL, KASIR_PASS)


@pytest.fixture(scope="module")
def test_month():
    # Use a far-past month to avoid interfering with real data
    return "2019-07"


@pytest.fixture(scope="module")
def db():
    client = AsyncIOMotorClient(MONGO_URL)
    return client[DB_NAME]


@pytest.fixture(scope="module")
def saved_rate(admin_token):
    r = requests.get(f"{API}/commission/settings", headers=_h(admin_token), timeout=15)
    return r.json().get("rate", 0)


@pytest.fixture(scope="module")
def kasir_user_id(admin_token):
    """Fetch kasir user id via users listing or login."""
    r = requests.post(f"{API}/auth/login", json={"email": KASIR_EMAIL, "password": KASIR_PASS}, timeout=15)
    assert r.status_code == 200
    uid = r.json().get("user", {}).get("id")
    assert uid, f"Could not fetch kasir id from login: {r.text}"
    return uid


@pytest.fixture(scope="module", autouse=True)
def seed_and_cleanup(admin_token, test_month, kasir_user_id, saved_rate):
    """Insert TEST data via APIs, cleanup after module.

    Strategy: create 2 online sales via /ecommerce/sales with created_at in test_month,
    then update status (Dikirim, Selesai). Also insert attendance docs directly in Mongo.
    """
    # Set a known commission rate = 10 for easier math
    requests.post(f"{API}/commission/settings", json={"rate": 10}, headers=_h(admin_token), timeout=15)

    # Need a product. Fetch one via /api/products
    pr = requests.get(f"{API}/products", headers=_h(admin_token), timeout=15)
    assert pr.status_code == 200, pr.text
    products = pr.json()
    assert len(products) > 0, "No products in DB to seed sale"
    prod = products[0]
    pid = prod["id"]
    harga = prod.get("harga_jual") or prod.get("price") or 10000

    # Channel
    ch = requests.get(f"{API}/channels", headers=_h(admin_token), timeout=15)
    channel_name = "Shopee"
    if ch.status_code == 200 and ch.json():
        channel_name = ch.json()[0]["name"]

    created_sales = []
    for _ in range(2):
        payload = {
            "channel": channel_name,
            "items": [{"product_id": pid, "name": prod.get("nama") or prod.get("name") or "TEST", "qty": 1, "harga": harga}],
            "admin_fee": 0, "ongkir": 0, "biaya_lain": 0,
            "fee_breakdown": [],
            "daerah": "TEST", "berat_total": 0,
            "customer_name": "TEST_customer", "order_no": "TEST_order",
            "date": f"{test_month}-15",
        }
        r = requests.post(f"{API}/ecommerce/sales", json=payload, headers=_h(admin_token), timeout=20)
        assert r.status_code == 200, f"Create sale failed: {r.status_code} {r.text}"
        created_sales.append(r.json()["id"])

    # Set statuses: first Dikirim, second Selesai
    r1 = requests.put(f"{API}/ecommerce/sales/{created_sales[0]}/status", json={"status": "Dikirim"},
                     headers=_h(admin_token), timeout=15)
    assert r1.status_code == 200
    r2 = requests.put(f"{API}/ecommerce/sales/{created_sales[1]}/status", json={"status": "Selesai"},
                     headers=_h(admin_token), timeout=15)
    assert r2.status_code == 200

    # Insert attendance docs directly in Mongo for test_month
    client = AsyncIOMotorClient(MONGO_URL)
    _db = client[DB_NAME]

    async def _seed_att():
        # kasir attends 3 days
        for d in ["01", "02", "03"]:
            await _db.attendance.update_one(
                {"user_id": kasir_user_id, "date": f"{test_month}-{d}"},
                {"$set": {"user_id": kasir_user_id, "user_name": "TEST_kasir", "date": f"{test_month}-{d}",
                          "status": "Hadir", "late": False, "check_in": None, "check_out": None, "work_minutes": 0}},
                upsert=True,
            )

    asyncio.get_event_loop().run_until_complete(_seed_att())

    yield {"sale_ids": created_sales, "kasir_uid": kasir_user_id, "channel": channel_name,
           "pid": pid, "harga": harga}

    # Cleanup
    async def _cleanup():
        for sid in created_sales:
            try:
                from bson import ObjectId
                await _db.ecommerce_sales.delete_one({"_id": ObjectId(sid)})
            except Exception:
                pass
        await _db.attendance.delete_many({"user_id": kasir_user_id,
                                          "date": {"$regex": f"^{re.escape(test_month)}"}})

    asyncio.get_event_loop().run_until_complete(_cleanup())
    # restore saved rate
    requests.post(f"{API}/commission/settings", json={"rate": saved_rate},
                  headers=_h(admin_token), timeout=15)


# -------- Settings endpoint tests --------
class TestCommissionSettings:
    def test_get_rate_admin(self, admin_token):
        r = requests.get(f"{API}/commission/settings", headers=_h(admin_token), timeout=15)
        assert r.status_code == 200
        assert "rate" in r.json()

    def test_set_rate_admin(self, admin_token):
        r = requests.post(f"{API}/commission/settings", json={"rate": 10}, headers=_h(admin_token), timeout=15)
        assert r.status_code == 200
        assert r.json()["rate"] == 10

    def test_kasir_cannot_set(self, kasir_token):
        r = requests.post(f"{API}/commission/settings", json={"rate": 1}, headers=_h(kasir_token), timeout=15)
        assert r.status_code == 403


# -------- Report structure + pool math --------
class TestCommissionReport:
    def test_kasir_blocked_report(self, kasir_token, test_month):
        r = requests.get(f"{API}/commission/report?month={test_month}", headers=_h(kasir_token), timeout=15)
        assert r.status_code == 403

    def test_report_pool_math(self, admin_token, test_month, seed_and_cleanup):
        r = requests.get(f"{API}/commission/report?month={test_month}", headers=_h(admin_token), timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["rate"] == 10
        tot = data["total"]
        # 2 sales created in this test_month
        assert tot["transaksi"] == 2, f"Expected 2 TEST sales, got {tot['transaksi']}"
        # Pool = laba_kotor * rate/100
        assert abs(tot["komisi"] - tot["laba_kotor"] * 0.10) < 0.01

    def test_report_only_kasir_rows(self, admin_token, test_month):
        r = requests.get(f"{API}/commission/report?month={test_month}", headers=_h(admin_token), timeout=15)
        data = r.json()
        # Admin role must NOT be in rows -> verify by cross referencing users
        import pymongo
        _c = pymongo.MongoClient(MONGO_URL)[DB_NAME]
        kasir_ids = {str(u["_id"]) for u in _c.users.find({"role": "kasir"})}
        admin_ids = {str(u["_id"]) for u in _c.users.find({"role": "admin"})}
        row_ids = {r["user_id"] for r in data["rows"]}
        assert row_ids.issubset(kasir_ids), f"Non-kasir rows present: {row_ids - kasir_ids}"
        assert row_ids.isdisjoint(admin_ids)

    def test_split_formula(self, admin_token, test_month, seed_and_cleanup):
        r = requests.get(f"{API}/commission/report?month={test_month}", headers=_h(admin_token), timeout=15)
        data = r.json()
        pool = data["total"]["komisi"]
        total_hadir = data["total_hadir"]
        assert total_hadir >= 3, f"Expected at least 3 kasir attendance days, got {total_hadir}"
        for row in data["rows"]:
            expected = round(pool * row["hadir"] / total_hadir) if total_hadir else 0
            assert row["komisi"] == expected, f"Komisi mismatch {row}"
        # terbagi == sum of row komisi
        assert data["total"]["terbagi"] == sum(r["komisi"] for r in data["rows"])

    def test_kasir_row_has_hadir_3(self, admin_token, test_month, kasir_user_id):
        r = requests.get(f"{API}/commission/report?month={test_month}", headers=_h(admin_token), timeout=15)
        data = r.json()
        row = next((x for x in data["rows"] if x["user_id"] == kasir_user_id), None)
        assert row is not None, f"Kasir row missing: {data['rows']}"
        assert row["hadir"] >= 3, f"Expected hadir>=3, got {row}"


# -------- Status change inclusion --------
class TestStatusTransition:
    def test_diproses_excluded_then_dikirim_included(self, admin_token, test_month, seed_and_cleanup):
        # Create another sale, keep in Diproses -> must not increment transaksi beyond 2
        payload = {
            "channel": seed_and_cleanup["channel"],
            "items": [{"product_id": seed_and_cleanup["pid"], "name": "TEST", "qty": 1, "harga": seed_and_cleanup["harga"]}],
            "admin_fee": 0, "ongkir": 0, "biaya_lain": 0, "fee_breakdown": [],
            "daerah": "TEST", "berat_total": 0,
            "customer_name": "TEST_c3", "order_no": "TEST_o3",
            "date": f"{test_month}-20",
        }
        r = requests.post(f"{API}/ecommerce/sales", json=payload, headers=_h(admin_token), timeout=20)
        assert r.status_code == 200
        sid3 = r.json()["id"]
        try:
            # Still 'Diproses' -> excluded
            rep = requests.get(f"{API}/commission/report?month={test_month}", headers=_h(admin_token), timeout=15).json()
            assert rep["total"]["transaksi"] == 2
            # Move to Dikirim
            u = requests.put(f"{API}/ecommerce/sales/{sid3}/status", json={"status": "Dikirim"},
                             headers=_h(admin_token), timeout=15)
            assert u.status_code == 200
            rep2 = requests.get(f"{API}/commission/report?month={test_month}", headers=_h(admin_token), timeout=15).json()
            assert rep2["total"]["transaksi"] == 3
        finally:
            # cleanup third sale
            from bson import ObjectId
            import pymongo
            _c = pymongo.MongoClient(MONGO_URL)[DB_NAME]
            _c.ecommerce_sales.delete_one({"_id": ObjectId(sid3)})


# -------- Payroll alignment --------
class TestPayrollAlignment:
    def test_kasir_komisi_in_payroll(self, admin_token, test_month, kasir_user_id):
        comm = requests.get(f"{API}/commission/report?month={test_month}", headers=_h(admin_token), timeout=15).json()
        kasir_komisi = {r["user_id"]: r["komisi"] for r in comm["rows"]}
        pay = requests.get(f"{API}/payroll/report?month={test_month}", headers=_h(admin_token), timeout=15)
        assert pay.status_code == 200, pay.text
        pdata = pay.json()
        for row in pdata["rows"]:
            if row["role"] == "kasir":
                assert row["komisi_calc"] == kasir_komisi.get(row["user_id"], 0), f"kasir komisi mismatch {row}"
            elif row["role"] == "admin":
                assert row["komisi_calc"] == 0, f"admin row should have komisi 0: {row}"


# -------- No attendance -> all zeros --------
class TestZeroAttendance:
    def test_month_with_no_attendance(self, admin_token):
        """A far-future month: no attendance, no sales -> all komisi 0, total_hadir 0."""
        future = "2099-01"
        r = requests.get(f"{API}/commission/report?month={future}", headers=_h(admin_token), timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["total_hadir"] == 0
        assert all(row["komisi"] == 0 for row in data["rows"])
