"""Iteration 40 - Cash report: online_belum_cair + daily arus kas."""
import os, uuid, pytest, requests
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if False else "https://" + open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split("\n")[0].strip().replace("https://","").replace("http://","")
# simpler:
BASE = open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split("\n")[0].strip().strip('"')

MONGO = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]

# Unique test period (far future month to avoid collision)
PERIOD = "2097-03"
MARK = f"TEST_ITER40_{uuid.uuid4().hex[:6]}"

@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE}/api/auth/login", json={"email": "nannsond@gmail.com", "password": "admin123"})
    assert r.status_code == 200, r.text
    return r.json()["token"]

@pytest.fixture(scope="module")
def h(token):
    return {"Authorization": f"Bearer {token}"}

@pytest.fixture(scope="module", autouse=True)
def seed_data():
    # Clean any prior leftover
    MONGO.ecommerce_sales.delete_many({"test_mark": MARK})
    MONGO.expenses.delete_many({"test_mark": MARK})
    MONGO.loans.delete_many({"test_mark": MARK})
    MONGO.transactions.delete_many({"test_mark": MARK})
    MONGO.purchases.delete_many({"test_mark": MARK})

    # 1 Selesai sale (cair.nominal set) on 2097-03-05
    MONGO.ecommerce_sales.insert_one({
        "test_mark": MARK, "status": "Selesai", "channel": "Shopee",
        "omzet": 1000000, "admin_fee": 50000, "total_fee": 50000,
        "cair": {"nominal": 900000}, "items": [],
        "created_at": "2097-03-05T10:00:00+00:00",
    })
    # 1 Selesai sale (no cair -> diterima = omzet-admin_fee = 400000) on 2097-03-10
    MONGO.ecommerce_sales.insert_one({
        "test_mark": MARK, "status": "Selesai", "channel": "Tokopedia",
        "omzet": 500000, "admin_fee": 100000, "total_fee": 100000,
        "items": [],
        "created_at": "2097-03-10T10:00:00+00:00",
    })
    # 2 pending (Diproses + Dikirim) - should NOT be in omzet, only in belum_cair
    MONGO.ecommerce_sales.insert_one({
        "test_mark": MARK, "status": "Diproses", "channel": "Shopee",
        "omzet": 200000, "admin_fee": 20000, "total_fee": 20000, "items": [],
        "created_at": "2097-03-07T10:00:00+00:00",
    })
    MONGO.ecommerce_sales.insert_one({
        "test_mark": MARK, "status": "Dikirim", "channel": "Shopee",
        "omzet": 300000, "admin_fee": 30000, "total_fee": 30000, "items": [],
        "created_at": "2097-03-08T10:00:00+00:00",
    })
    # Offline POS transaction - total 250000, assume tx_fraction=1 (no splits)
    MONGO.transactions.insert_one({
        "test_mark": MARK, "total": 250000, "items": [],
        "payment": {"method": "cash"}, "cashier_id": "x", "cashier_name": "test",
        "created_at": "2097-03-05T12:00:00+00:00",
    })
    # Loan disbursed
    MONGO.loans.insert_one({
        "test_mark": MARK, "principal": 2000000, "disbursed": True,
        "disbursed_date": "2097-03-06T00:00:00+00:00",
        "created_at": "2097-03-01T00:00:00+00:00",
    })
    # Expense
    MONGO.expenses.insert_one({
        "test_mark": MARK, "amount": 150000,
        "created_at": "2097-03-10T09:00:00+00:00",
    })
    # Purchase
    MONGO.purchases.insert_one({
        "test_mark": MARK, "amount_paid": 400000,
        "created_at": "2097-03-11T09:00:00+00:00",
    })
    yield
    MONGO.ecommerce_sales.delete_many({"test_mark": MARK})
    MONGO.expenses.delete_many({"test_mark": MARK})
    MONGO.loans.delete_many({"test_mark": MARK})
    MONGO.transactions.delete_many({"test_mark": MARK})
    MONGO.purchases.delete_many({"test_mark": MARK})


def test_report_cash_period(h):
    r = requests.get(f"{BASE}/api/reports/cash", params={"period": PERIOD}, headers=h)
    assert r.status_code == 200, r.text
    d = r.json()
    # omzet_online_cair = 900000 (cair.nominal) + 400000 (diterima) = 1_300_000
    assert d["omzet_online_cair"] == 1300000, d
    # omzet_offline = 250000 (tx_fraction=1 since no splits)
    assert d["omzet_offline"] == 250000, d
    assert d["pinjaman_masuk"] == 2000000
    assert d["pembelian"] == 400000
    assert d["pengeluaran"] == 150000
    # Pending NOT in omzet
    assert d["omzet"] == 250000 + 1300000
    # online_belum_cair = (200000-20000)+(300000-30000) = 180000+270000 = 450000
    assert d["online_belum_cair"] == 450000, d
    assert d["online_belum_cair_count"] == 2
    assert d["online_belum_cair_bruto"] == 500000
    # kas_saat_ini = omzet + pinjaman - pembelian - pengeluaran (period=true -> saldo_awal=0)
    assert d["saldo_awal_kas"] == 0
    assert d["kas_saat_ini"] == 1550000 + 2000000 - 400000 - 150000


def test_report_cash_daily(h):
    r = requests.get(f"{BASE}/api/reports/cash/daily", params={"period": PERIOD}, headers=h)
    assert r.status_code == 200, r.text
    data = r.json()
    rows = data["rows"]
    assert len(rows) >= 4  # distinct dates with activity
    # Check sum equality with /reports/cash
    rc = requests.get(f"{BASE}/api/reports/cash", params={"period": PERIOD}, headers=h).json()
    sum_toko = sum(r["toko"] for r in rows)
    sum_online = sum(r["online"] for r in rows)
    sum_pinjaman = sum(r["pinjaman"] for r in rows)
    sum_pembelian = sum(r["pembelian"] for r in rows)
    sum_pengeluaran = sum(r["pengeluaran"] for r in rows)
    assert sum_toko == rc["omzet_offline"]
    assert sum_online == rc["omzet_online_cair"]
    assert sum_pinjaman == rc["pinjaman_masuk"]
    assert sum_pembelian == rc["pembelian"]
    assert sum_pengeluaran == rc["pengeluaran"]
    # last saldo_berjalan == kas_saat_ini
    assert rows[-1]["saldo_berjalan"] == rc["kas_saat_ini"]
    # Rows ordered ascending
    dates = [r["date"] for r in rows]
    assert dates == sorted(dates)
    # Each row contains required fields
    for r in rows:
        for k in ("toko", "online", "pinjaman", "pembelian", "pengeluaran", "masuk", "keluar", "bersih", "saldo_berjalan"):
            assert k in r
        assert r["masuk"] == r["toko"] + r["online"] + r["pinjaman"]
        assert r["keluar"] == r["pembelian"] + r["pengeluaran"]
        assert r["bersih"] == r["masuk"] - r["keluar"]


def test_report_cash_year(h):
    r = requests.get(f"{BASE}/api/reports/cash", params={"period": "2097"}, headers=h)
    assert r.status_code == 200
    d = r.json()
    # Same totals should surface in year filter
    assert d["online_belum_cair"] == 450000
    assert d["kas_saat_ini"] == 1550000 + 2000000 - 400000 - 150000
