"""Iteration 41 - Cash day detail endpoint + cair.tanggal routing (not created_at month)."""
import os, uuid, pytest, requests
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
BASE = open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split("\n")[0].strip().strip('"')
MONGO = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]

PERIOD_ORDER = "2098-04"  # month sale was created
PERIOD_CAIR = "2098-05"   # month cair happens -> expect kas here
CAIR_DATE = "2098-05-07"
ORDER_DATE = "2098-04-28"
POS_DATE = "2098-05-07"   # same day as cair, for day detail
EXP_DATE = "2098-05-07"
LOAN_DATE = "2098-05-07"
PUR_DATE = "2098-05-07"

MARK = f"TEST_ITER41_{uuid.uuid4().hex[:6]}"

@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE}/api/auth/login",
                      json={"email": "nannsond@gmail.com", "password": "admin123"})
    assert r.status_code == 200, r.text
    return r.json()["token"]

@pytest.fixture(scope="module")
def h(token):
    return {"Authorization": f"Bearer {token}"}

@pytest.fixture(scope="module", autouse=True)
def seed():
    for c in ("ecommerce_sales", "expenses", "loans", "transactions", "purchases"):
        MONGO[c].delete_many({"test_mark": MARK})

    # Online Selesai with cair.tanggal in different month than created_at
    MONGO.ecommerce_sales.insert_one({
        "test_mark": MARK, "status": "Selesai", "channel": "TikTok Shop",
        "order_no": "TT-ITER41-1", "customer_name": "A", "items": [],
        "omzet": 1000000, "admin_fee": 50000, "total_fee": 50000,
        "cair": {"tanggal": CAIR_DATE, "nominal": 900000},
        "created_at": f"{ORDER_DATE}T10:00:00+00:00",
    })
    # Online Selesai WITHOUT cair - counted on created_at (= 2098-04)
    MONGO.ecommerce_sales.insert_one({
        "test_mark": MARK, "status": "Selesai", "channel": "Shopee",
        "order_no": "SP-ITER41-2", "customer_name": "B", "items": [],
        "omzet": 500000, "admin_fee": 100000, "total_fee": 100000,
        "created_at": f"{ORDER_DATE}T10:00:00+00:00",
    })
    # POS, expense, loan, purchase on CAIR_DATE
    MONGO.transactions.insert_one({
        "test_mark": MARK, "total": 250000, "items": [], "status": "lunas",
        "invoice_no": "INV-ITER41", "customer_name": "WalkIn",
        "payment_method": "cash", "cashier_id": "x", "cashier_name": "t",
        "created_at": f"{POS_DATE}T12:00:00+00:00",
    })
    MONGO.loans.insert_one({
        "test_mark": MARK, "principal": 2000000, "lender": "BankTest",
        "note": "modal", "disbursed": True,
        "disbursed_date": f"{LOAN_DATE}T00:00:00+00:00",
        "created_at": f"{LOAN_DATE}T00:00:00+00:00",
    })
    MONGO.expenses.insert_one({
        "test_mark": MARK, "amount": 150000, "category": "Listrik",
        "note": "pln", "created_at": f"{EXP_DATE}T09:00:00+00:00",
    })
    MONGO.purchases.insert_one({
        "test_mark": MARK, "amount_paid": 400000, "po_no": "PO-ITER41",
        "supplier": "SupTest",
        "created_at": f"{PUR_DATE}T09:00:00+00:00",
    })
    yield
    for c in ("ecommerce_sales", "expenses", "loans", "transactions", "purchases"):
        MONGO[c].delete_many({"test_mark": MARK})


# --------------- Cair-tanggal month routing ---------------
def test_cair_routed_to_cair_month_not_order_month(h):
    """Online sale with cair.tanggal must count in cair month, not order month."""
    r_order = requests.get(f"{BASE}/api/reports/cash",
                           params={"period": PERIOD_ORDER}, headers=h).json()
    r_cair = requests.get(f"{BASE}/api/reports/cash",
                          params={"period": PERIOD_CAIR}, headers=h).json()

    # In order month (2098-04): only the second sale (no cair) = 500k-100k = 400k
    assert r_order["omzet_online_cair"] == 400000, r_order
    # In cair month (2098-05): first sale cair.nominal = 900k
    assert r_cair["omzet_online_cair"] == 900000, r_cair


def test_daily_cair_tanggal(h):
    r = requests.get(f"{BASE}/api/reports/cash/daily",
                     params={"period": PERIOD_CAIR}, headers=h).json()
    row = next((x for x in r["rows"] if x["date"] == CAIR_DATE), None)
    assert row is not None, r["rows"]
    assert row["online"] == 900000
    assert row["toko"] == 250000
    assert row["pinjaman"] == 2000000
    assert row["pembelian"] == 400000
    assert row["pengeluaran"] == 150000
    assert row["masuk"] == 250000 + 900000 + 2000000
    assert row["keluar"] == 400000 + 150000
    assert row["bersih"] == row["masuk"] - row["keluar"]


# --------------- /reports/cash/day endpoint ---------------
def test_cash_day_items_match_daily_row(h):
    day = requests.get(f"{BASE}/api/reports/cash/day",
                       params={"date": CAIR_DATE}, headers=h).json()
    assert day["date"] == CAIR_DATE
    items = day["items"]
    assert len(items) == 5  # toko, online, pinjaman, pembelian, pengeluaran

    kinds = {k: 0 for k in ("toko", "online", "pinjaman", "pembelian", "pengeluaran")}
    for it in items:
        assert it["kind"] in kinds
        assert it["date"] == CAIR_DATE
        for f in ("amount", "title", "desc", "info"):
            assert f in it, it
        # bruto/fee stripped
        assert "bruto" not in it
        assert "fee" not in it
        kinds[it["kind"]] += it["amount"]

    # Compare per-kind sums to the daily row
    daily = requests.get(f"{BASE}/api/reports/cash/daily",
                        params={"period": PERIOD_CAIR}, headers=h).json()
    row = next(x for x in daily["rows"] if x["date"] == CAIR_DATE)
    for k, v in kinds.items():
        assert v == row[k], f"{k}: day items sum {v} vs daily row {row[k]}"

    # Ordering: kinds appear in CASH_KINDS order
    order = ["toko", "online", "pinjaman", "pembelian", "pengeluaran"]
    seen_indices = [order.index(it["kind"]) for it in items]
    assert seen_indices == sorted(seen_indices), seen_indices


def test_cash_day_online_has_cair_info(h):
    day = requests.get(f"{BASE}/api/reports/cash/day",
                       params={"date": CAIR_DATE}, headers=h).json()
    online = [i for i in day["items"] if i["kind"] == "online"]
    assert len(online) == 1
    assert online[0]["amount"] == 900000
    assert "TikTok" in online[0]["title"]
    assert "Cair tercatat" in online[0]["info"]


def test_cash_day_empty(h):
    day = requests.get(f"{BASE}/api/reports/cash/day",
                       params={"date": "2098-05-20"}, headers=h).json()
    assert day["items"] == []


def test_cash_day_zero_amount_filtered(h):
    """items with amount=0 should be excluded."""
    day = requests.get(f"{BASE}/api/reports/cash/day",
                       params={"date": CAIR_DATE}, headers=h).json()
    for it in day["items"]:
        assert it["amount"] != 0


# --------------- Regression: card totals == daily totals ---------------
def test_card_totals_equal_daily_totals(h):
    rc = requests.get(f"{BASE}/api/reports/cash",
                      params={"period": PERIOD_CAIR}, headers=h).json()
    daily = requests.get(f"{BASE}/api/reports/cash/daily",
                        params={"period": PERIOD_CAIR}, headers=h).json()["rows"]
    assert sum(r["toko"] for r in daily) == rc["omzet_offline"]
    assert sum(r["online"] for r in daily) == rc["omzet_online_cair"]
    assert sum(r["pinjaman"] for r in daily) == rc["pinjaman_masuk"]
    assert sum(r["pembelian"] for r in daily) == rc["pembelian"]
    assert sum(r["pengeluaran"] for r in daily) == rc["pengeluaran"]
    if daily:
        assert daily[-1]["saldo_berjalan"] == rc["kas_saat_ini"]
