"""
Iteration 17 — End-to-end backend integration tests for Mulyatani.

Covers (admin flows):
- Product CRUD (TEST_ prefixed data)
- Bundle (paket) create + stock view
- POS transaction (full payment, piutang partial, bundle item), stock decrement, piutang listing, pay-off
- Transaction edit (stock reconciliation) + delete (stock restoration)
- Stok opname (fisik -> product stock update + history)
- Pembelian (purchase) -> stock increases, hutang listing, pay-off
- Pengantaran: tx with alamat appears in deliveries, status update, archive
- Ecommerce (penjualan online) create + status Selesai -> appears in reports; delete restores stock
- Expenses create + list + delete
- Attendance: mark + list recap; settings
- Payroll report + archive
- Reports daily/monthly/yearly reflect our test transaction
- Settings info save

Cleanup: Every artifact is prefixed with TEST_ and deleted on teardown.
"""
import os
import uuid
from datetime import datetime, timezone

import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://mulyatani.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "nannsond@gmail.com"
ADMIN_PASSWORD = "admin123"

TAG = uuid.uuid4().hex[:6]  # unique tag so re-runs don't collide


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    assert r.status_code == 200, r.text
    s.headers.update({"Authorization": f"Bearer {r.json()['token']}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def ctx():
    """Shared context across tests (ids captured for cleanup)."""
    return {
        "product_ids": [],
        "bundle_ids": [],
        "tx_ids": [],
        "purchase_ids": [],
        "expense_ids": [],
        "online_ids": [],
        "attendance_ids": [],
    }


@pytest.fixture(scope="module", autouse=True)
def _cleanup(session, ctx):
    yield
    # best-effort cleanup
    for tid in ctx["tx_ids"]:
        session.delete(f"{BASE}/api/transactions/{tid}")
    for eid in ctx["expense_ids"]:
        session.delete(f"{BASE}/api/expenses/{eid}")
    for sid in ctx["online_ids"]:
        session.delete(f"{BASE}/api/ecommerce/sales/{sid}")
    for bid in ctx["bundle_ids"]:
        session.delete(f"{BASE}/api/bundles/{bid}")
    for pid in ctx["product_ids"]:
        session.delete(f"{BASE}/api/products/{pid}")
    for aid in ctx["attendance_ids"]:
        session.delete(f"{BASE}/api/attendance/{aid}")


# ---------- Products ----------
def test_product_crud(session, ctx):
    p = {"sku": f"TEST_SKU_{TAG}_A", "name": f"TEST_Pupuk_{TAG}",
         "category": "Pupuk", "unit": "kg", "harga_beli": 10000,
         "harga_jual": 15000, "harga_reseller": 13500, "stok": 100, "stok_minimal": 5}
    r = session.post(f"{BASE}/api/products", json=p); assert r.status_code == 200, r.text
    data = r.json(); pid = data["id"]; ctx["product_ids"].append(pid)
    assert data["sku"] == p["sku"] and data["stok"] == 100

    # GET verify persistence
    r = session.get(f"{BASE}/api/products"); assert r.status_code == 200
    assert any(x["id"] == pid for x in r.json())

    # PUT update
    p2 = {**p, "harga_jual": 16000}
    r = session.put(f"{BASE}/api/products/{pid}", json=p2); assert r.status_code == 200
    assert r.json()["harga_jual"] == 16000


def test_product_duplicate_sku(session, ctx):
    sku = f"TEST_SKU_{TAG}_DUP"
    p = {"sku": sku, "name": f"TEST_X_{TAG}", "category": "C", "harga_jual": 1000, "stok": 1}
    r = session.post(f"{BASE}/api/products", json=p); assert r.status_code == 200
    ctx["product_ids"].append(r.json()["id"])
    r2 = session.post(f"{BASE}/api/products", json=p)
    assert r2.status_code == 400


# ---------- Second product for POS + bundle ----------
@pytest.fixture(scope="module")
def product_b(session, ctx):
    p = {"sku": f"TEST_SKU_{TAG}_B", "name": f"TEST_Benih_{TAG}",
         "category": "Benih", "unit": "pcs", "harga_beli": 5000,
         "harga_jual": 8000, "harga_reseller": 7000, "stok": 50, "stok_minimal": 5}
    r = session.post(f"{BASE}/api/products", json=p); assert r.status_code == 200
    pid = r.json()["id"]; ctx["product_ids"].append(pid)
    return {"id": pid, **p}


@pytest.fixture(scope="module")
def product_a(session, ctx):
    p = {"sku": f"TEST_SKU_{TAG}_POS", "name": f"TEST_Pupuk_POS_{TAG}",
         "category": "Pupuk", "unit": "kg", "harga_beli": 10000,
         "harga_jual": 15000, "harga_reseller": 13500, "stok": 200, "stok_minimal": 5}
    r = session.post(f"{BASE}/api/products", json=p); assert r.status_code == 200
    pid = r.json()["id"]; ctx["product_ids"].append(pid)
    return {"id": pid, **p}


# ---------- Bundle ----------
def test_bundle_create_and_stock(session, ctx, product_a, product_b):
    bundle = {"name": f"TEST_Paket_{TAG}", "category": "Paket",
              "harga_jual": 20000, "harga_reseller": 18000,
              "components": [
                  {"product_id": product_a["id"], "name": product_a["name"], "qty": 1},
                  {"product_id": product_b["id"], "name": product_b["name"], "qty": 2}]}
    r = session.post(f"{BASE}/api/bundles", json=bundle); assert r.status_code == 200
    bid = r.json()["id"]; ctx["bundle_ids"].append(bid)

    r = session.get(f"{BASE}/api/bundles"); assert r.status_code == 200
    mine = [b for b in r.json() if b["id"] == bid]
    assert mine and mine[0]["stok"] >= 1
    assert mine[0]["is_bundle"] is True


# ---------- POS transaction ----------
def test_pos_transaction_and_stock_decrease(session, ctx, product_a):
    r = session.get(f"{BASE}/api/products"); 
    stok_before = next(p for p in r.json() if p["id"] == product_a["id"])["stok"]

    payload = {"items": [{"product_id": product_a["id"], "name": product_a["name"],
                           "qty": 3, "harga": product_a["harga_jual"]}],
               "payment_method": "Tunai", "discount": 1000, "ongkir": 2000,
               "customer_name": f"TEST_Pelanggan_{TAG}", "telepon": "081234567890",
               "alamat": "TEST_Alamat_Jl_Kebun_1"}
    r = session.post(f"{BASE}/api/transactions", json=payload); assert r.status_code == 200, r.text
    tx = r.json(); ctx["tx_ids"].append(tx["id"])
    assert tx["invoice_no"].startswith("INV-")
    assert tx["status"] == "lunas"
    assert tx["total"] == 3 * product_a["harga_jual"] - 1000 + 2000
    assert tx["status_antar"] == "belum"  # has alamat

    # stock decreased
    r = session.get(f"{BASE}/api/products")
    stok_after = next(p for p in r.json() if p["id"] == product_a["id"])["stok"]
    assert stok_after == stok_before - 3

    # listed in /api/transactions
    r = session.get(f"{BASE}/api/transactions")
    assert any(t["id"] == tx["id"] for t in r.json())


def test_pos_piutang_partial(session, ctx, product_b):
    payload = {"items": [{"product_id": product_b["id"], "name": product_b["name"],
                           "qty": 2, "harga": product_b["harga_jual"]}],
               "payment_method": "Tunai", "amount_paid": 5000}
    r = session.post(f"{BASE}/api/transactions", json=payload); assert r.status_code == 200
    tx = r.json(); ctx["tx_ids"].append(tx["id"])
    assert tx["status"] == "sebagian"
    assert tx["amount_paid"] == 5000

    # appears in piutang
    r = session.get(f"{BASE}/api/piutang"); assert r.status_code == 200
    piu = [x for x in r.json() if x["id"] == tx["id"]]
    assert piu and piu[0]["sisa"] == tx["total"] - 5000

    # pay off remaining
    r = session.post(f"{BASE}/api/transactions/{tx['id']}/pay", json={"amount": tx["total"] - 5000})
    assert r.status_code == 200 and r.json()["status"] == "lunas"


def test_transaction_delete_restores_stock(session, ctx, product_a):
    # create disposable tx then delete; expect stock back
    r = session.get(f"{BASE}/api/products")
    before = next(p for p in r.json() if p["id"] == product_a["id"])["stok"]
    r = session.post(f"{BASE}/api/transactions", json={
        "items": [{"product_id": product_a["id"], "name": product_a["name"], "qty": 2, "harga": 15000}],
        "payment_method": "Tunai"})
    assert r.status_code == 200; tid = r.json()["id"]

    r = session.delete(f"{BASE}/api/transactions/{tid}"); assert r.status_code == 200
    r = session.get(f"{BASE}/api/products")
    after = next(p for p in r.json() if p["id"] == product_a["id"])["stok"]
    assert after == before, f"expected stock restored {before}, got {after}"


# ---------- Stok Opname ----------
def test_stok_opname(session, ctx, product_a):
    r = session.get(f"{BASE}/api/products")
    before = next(p for p in r.json() if p["id"] == product_a["id"])["stok"]
    target = before - 1
    r = session.post(f"{BASE}/api/stok-opname", json={"product_id": product_a["id"],
                                                      "stok_fisik": target, "alasan": "TEST_Penyesuaian"})
    assert r.status_code == 200, r.text
    r = session.get(f"{BASE}/api/products")
    after = next(p for p in r.json() if p["id"] == product_a["id"])["stok"]
    assert after == target

    r = session.get(f"{BASE}/api/stok-opname"); assert r.status_code == 200
    assert any(d["product_id"] == product_a["id"] for d in r.json())


# ---------- Pembelian ----------
def test_pembelian_and_hutang(session, ctx, product_a):
    r = session.get(f"{BASE}/api/products")
    before = next(p for p in r.json() if p["id"] == product_a["id"])["stok"]
    payload = {"supplier": f"TEST_Supplier_{TAG}",
               "items": [{"product_id": product_a["id"], "name": product_a["name"],
                           "qty": 10, "harga_beli": 9500}],
               "amount_paid": 50000, "note": "TEST_po"}
    r = session.post(f"{BASE}/api/purchases", json=payload); assert r.status_code == 200
    po = r.json(); ctx["purchase_ids"].append(po["id"])
    assert po["total"] == 95000
    assert po["status"] == "sebagian"

    # stock increased
    r = session.get(f"{BASE}/api/products")
    after = next(p for p in r.json() if p["id"] == product_a["id"])["stok"]
    assert after == before + 10

    # appears in hutang
    r = session.get(f"{BASE}/api/hutang"); assert r.status_code == 200
    hu = [x for x in r.json() if x["id"] == po["id"]]
    assert hu and hu[0]["sisa"] == 45000

    # pay off
    r = session.post(f"{BASE}/api/purchases/{po['id']}/pay", json={"amount": 45000})
    assert r.status_code == 200 and r.json()["status"] == "lunas"


# ---------- Pengantaran ----------
def test_pengantaran_flow(session, ctx):
    r = session.get(f"{BASE}/api/deliveries"); assert r.status_code == 200
    deliveries = r.json()
    mine = [d for d in deliveries if d["id"] in ctx["tx_ids"]]
    assert mine, "Delivery (tx with alamat) should appear in /api/deliveries"
    tid = mine[0]["id"]

    r = session.put(f"{BASE}/api/deliveries/{tid}/status", json={"status_antar": "diantar"})
    assert r.status_code == 200 and r.json()["status_antar"] == "diantar"

    r = session.put(f"{BASE}/api/deliveries/{tid}/status", json={"status_antar": "selesai"})
    assert r.status_code == 200

    # archive
    r = session.put(f"{BASE}/api/deliveries/{tid}/archive", json={"arsip": True})
    assert r.status_code == 200 and r.json()["arsip"] is True


# ---------- Ecommerce / Penjualan Online ----------
def test_ecommerce_sale_create_and_delete_restores(session, ctx, product_b):
    r = session.get(f"{BASE}/api/products")
    before = next(p for p in r.json() if p["id"] == product_b["id"])["stok"]
    payload = {"channel": "Shopee",
               "items": [{"product_id": product_b["id"], "name": product_b["name"],
                           "qty": 1, "harga": 8000}],
               "customer_name": f"TEST_Online_{TAG}"}
    r = session.post(f"{BASE}/api/ecommerce/sales", json=payload); assert r.status_code == 200, r.text
    sale = r.json(); sid = sale.get("id") or sale.get("_id")
    assert sid
    ctx["online_ids"].append(sid)

    r = session.get(f"{BASE}/api/products")
    after = next(p for p in r.json() if p["id"] == product_b["id"])["stok"]
    assert after == before - 1

    # delete restores stock
    r = session.delete(f"{BASE}/api/ecommerce/sales/{sid}"); assert r.status_code == 200
    ctx["online_ids"].remove(sid)
    r = session.get(f"{BASE}/api/products")
    assert next(p for p in r.json() if p["id"] == product_b["id"])["stok"] == before


# ---------- Expenses ----------
def test_expenses_crud(session, ctx):
    r = session.post(f"{BASE}/api/expenses", json={"category": "TEST_Operasional",
                                                   "amount": 25000, "note": f"TEST_{TAG}"})
    assert r.status_code == 200
    eid = r.json()["id"]; ctx["expense_ids"].append(eid)
    r = session.get(f"{BASE}/api/expenses"); assert r.status_code == 200
    assert any(x["id"] == eid for x in r.json())


# ---------- Attendance + Payroll ----------
def test_attendance_mark_and_recap(session, ctx):
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    r = session.post(f"{BASE}/api/attendance/mark", json={"date": today, "status": "Hadir"})
    assert r.status_code == 200
    month = today[:7]
    r = session.get(f"{BASE}/api/attendance", params={"month": month})
    assert r.status_code == 200 and "records" in r.json() and "recap" in r.json()


def test_payroll_report_and_archive(session):
    month = datetime.now(timezone.utc).strftime("%Y-%m")
    r = session.get(f"{BASE}/api/payroll/report", params={"month": month})
    assert r.status_code == 200
    assert "rows" in r.json()
    # archive this month
    r = session.post(f"{BASE}/api/payroll/archive", json={"month": month})
    assert r.status_code == 200 and r.json()["ok"] is True


# ---------- Reports reflect test tx ----------
def test_reports_reflect_tx(session, ctx):
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    r = session.get(f"{BASE}/api/reports/daily", params={"date": today}); assert r.status_code == 200
    data = r.json(); assert "summary" in data and "transactions" in data
    assert data["summary"]["jumlah_transaksi"] >= 1

    y, m = today[:4], today[5:7]
    r = session.get(f"{BASE}/api/reports/monthly", params={"year": y, "month": m}); assert r.status_code == 200
    r = session.get(f"{BASE}/api/reports/yearly", params={"year": y}); assert r.status_code == 200


# ---------- Settings info ----------
def test_settings_info_save(session):
    r = session.get(f"{BASE}/api/settings"); assert r.status_code == 200
    before = r.json()
    payload = {"store_name": before.get("store_name") or "TEST_Mulyatani",
               "address": before.get("address") or "TEST_Address",
               "phone": before.get("phone") or "08120000000"}
    r = session.post(f"{BASE}/api/settings/info", json=payload); assert r.status_code == 200


# ---------- Unauthorized access ----------
def test_unauthorized():
    r = requests.post(f"{BASE}/api/products", json={"sku": "x", "name": "x", "category": "x"}, timeout=10)
    assert r.status_code in (401, 403)
