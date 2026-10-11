"""Iter44: Riwayat Pembayaran - /api/piutang & /api/hutang all=true includes lunas with payments."""
import os
import pytest
import requests
from pymongo import MongoClient
from bson import ObjectId

BASE = os.environ['REACT_APP_BACKEND_URL'].rstrip('/')
MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'test_database')

ADMIN = {"email": "nannsond@gmail.com", "password": "admin123"}

_mongo = MongoClient(MONGO_URL)
_db = _mongo[DB_NAME]

_state = {}


def _auth():
    r = requests.post(f"{BASE}/api/auth/login", json=ADMIN, timeout=20)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def setup_module(module):
    h = _auth()
    _state['h'] = h
    # product
    sku = f"TEST_ITER44_{ObjectId()}"
    r = requests.post(f"{BASE}/api/products",
                      json={"sku": sku, "name": "Iter44 Prod", "category": "TEST",
                            "harga_beli": 1000, "harga_jual": 5000, "stok": 100}, headers=h, timeout=20)
    assert r.status_code == 200, r.text
    _state['pid'] = r.json()['id']
    _state['sku'] = sku

    # Sale A: partial (sebagian) - total 10000, amount_paid 3000
    item = [{"product_id": _state['pid'], "name": "Iter44 Prod", "qty": 2, "harga": 5000}]
    r = requests.post(f"{BASE}/api/transactions",
                      json={"items": item, "payment_method": "Tunai",
                            "customer_name": "TEST_ITER44_A", "amount_paid": 3000}, headers=h, timeout=20)
    assert r.status_code == 200, r.text
    _state['sale_partial'] = r.json()['id']

    # Sale B: start sebagian then pay off to lunas (payments non-empty)
    r = requests.post(f"{BASE}/api/transactions",
                      json={"items": item, "payment_method": "Tunai",
                            "customer_name": "TEST_ITER44_B", "amount_paid": 4000}, headers=h, timeout=20)
    assert r.status_code == 200
    sb = r.json()['id']
    _state['sale_lunas'] = sb
    # pay off remaining 6000
    r = requests.post(f"{BASE}/api/transactions/{sb}/pay",
                      json={"amount": 6000, "date": "2026-01-10"}, headers=h, timeout=20)
    assert r.status_code == 200, r.text
    assert r.json()['status'] == 'lunas'

    # Sale C: lunas without any payment history (fully paid at creation) - should NOT appear even with all=true
    r = requests.post(f"{BASE}/api/transactions",
                      json={"items": item, "payment_method": "Tunai",
                            "customer_name": "TEST_ITER44_C"}, headers=h, timeout=20)
    assert r.status_code == 200
    _state['sale_lunas_nopay'] = r.json()['id']

    # Purchase A: partial (sebagian)
    pit = [{"product_id": _state['pid'], "name": "Iter44 Prod", "qty": 1, "harga_beli": 2000}]
    r = requests.post(f"{BASE}/api/purchases",
                      json={"supplier": "TEST_ITER44_SUP_A", "items": pit, "amount_paid": 500}, headers=h, timeout=20)
    assert r.status_code == 200
    _state['pur_partial'] = r.json()['id']

    # Purchase B: pay off via /pay -> lunas with payments
    r = requests.post(f"{BASE}/api/purchases",
                      json={"supplier": "TEST_ITER44_SUP_B", "items": pit, "amount_paid": 0}, headers=h, timeout=20)
    assert r.status_code == 200
    pb = r.json()['id']
    _state['pur_lunas'] = pb
    r = requests.post(f"{BASE}/api/purchases/{pb}/pay",
                      json={"amount": 2000, "date": "2026-01-12"}, headers=h, timeout=20)
    assert r.status_code == 200
    assert r.json()['status'] == 'lunas'


def teardown_module(module):
    try:
        _db.transactions.delete_many({"customer_name": {"$regex": "^TEST_ITER44"}})
        _db.purchases.delete_many({"supplier": {"$regex": "^TEST_ITER44"}})
        _db.products.delete_many({"sku": {"$regex": "^TEST_ITER44"}})
    except Exception as e:
        print("teardown err", e)


# ----------- Piutang -----------

def test_piutang_default_only_open():
    h = _state['h']
    r = requests.get(f"{BASE}/api/piutang", headers=h, timeout=20)
    assert r.status_code == 200
    ids = {d['id']: d for d in r.json()}
    # partial sale is in list
    assert _state['sale_partial'] in ids
    d = ids[_state['sale_partial']]
    assert d['status'] == 'sebagian'
    assert d['sisa'] == d['total'] - d.get('amount_paid', 0)
    # lunas sales must NOT appear
    assert _state['sale_lunas'] not in ids
    assert _state['sale_lunas_nopay'] not in ids


def test_piutang_all_includes_lunas_with_payments():
    h = _state['h']
    r = requests.get(f"{BASE}/api/piutang?all=true", headers=h, timeout=20)
    assert r.status_code == 200
    ids = {d['id']: d for d in r.json()}
    assert _state['sale_partial'] in ids
    # lunas with payments: should be included
    assert _state['sale_lunas'] in ids
    lu = ids[_state['sale_lunas']]
    assert lu['status'] == 'lunas'
    assert lu['sisa'] == 0
    assert len(lu.get('payments', [])) >= 1
    # lunas without payments: should NOT be included
    assert _state['sale_lunas_nopay'] not in ids


# ----------- Hutang -----------

def test_hutang_default_only_open():
    h = _state['h']
    r = requests.get(f"{BASE}/api/hutang", headers=h, timeout=20)
    assert r.status_code == 200
    ids = {d['id']: d for d in r.json()}
    assert _state['pur_partial'] in ids
    d = ids[_state['pur_partial']]
    assert d['status'] == 'sebagian'
    assert d['sisa'] == d['total'] - d.get('amount_paid', 0)
    assert _state['pur_lunas'] not in ids


def test_hutang_all_includes_lunas_with_payments():
    h = _state['h']
    r = requests.get(f"{BASE}/api/hutang?all=true", headers=h, timeout=20)
    assert r.status_code == 200
    ids = {d['id']: d for d in r.json()}
    assert _state['pur_partial'] in ids
    assert _state['pur_lunas'] in ids
    lu = ids[_state['pur_lunas']]
    assert lu['status'] == 'lunas'
    assert lu['sisa'] == 0
    assert len(lu.get('payments', [])) >= 1


def test_payment_persisted_with_date():
    """Verify payment date is persisted correctly for piutang pay-off."""
    h = _state['h']
    r = requests.get(f"{BASE}/api/piutang?all=true", headers=h, timeout=20)
    doc = next(d for d in r.json() if d['id'] == _state['sale_lunas'])
    pays = doc['payments']
    assert len(pays) == 1
    assert pays[0]['date'][:10] == '2026-01-10'
    assert pays[0]['amount'] == 6000

    r = requests.get(f"{BASE}/api/hutang?all=true", headers=h, timeout=20)
    doc = next(d for d in r.json() if d['id'] == _state['pur_lunas'])
    pays = doc['payments']
    assert len(pays) == 1
    assert pays[0]['date'][:10] == '2026-01-12'
    assert pays[0]['amount'] == 2000
