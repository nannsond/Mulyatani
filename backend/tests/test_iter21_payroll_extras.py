"""Iteration 21: Hapus arsip, telepon, potongan_items multi-row, editable counts (hadir/telat/alpha/izin)."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
ADMIN_EMAIL = "nannsond@gmail.com"
ADMIN_PASS = "admin123"
MONTH = "2099-07"  # unique test month, far future


@pytest.fixture(scope="module")
def headers():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
    assert r.status_code == 200, r.text
    data = r.json()
    token = data.get("access_token") or data.get("token")
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def test_user(headers):
    payload = {"email": "test_iter21_payroll@example.com", "password": "test123", "name": "TEST_Iter21", "role": "kasir"}
    r = requests.post(f"{BASE_URL}/api/users", json=payload, headers=headers)
    if r.status_code in (400, 409):
        users = requests.get(f"{BASE_URL}/api/users", headers=headers).json()
        u = next((u for u in users if u["email"] == payload["email"]), None)
        assert u
        uid = u["id"]
    else:
        assert r.status_code == 200, r.text
        uid = r.json()["id"]
    yield uid
    # cleanup
    requests.delete(f"{BASE_URL}/api/users/{uid}", headers=headers)
    requests.delete(f"{BASE_URL}/api/payroll/archive/{MONTH}", headers=headers)


# ---------- payroll/phone ----------
def test_payroll_phone_save_and_in_report(headers, test_user):
    tel = "081234567890"
    r = requests.post(f"{BASE_URL}/api/payroll/phone", json={"user_id": test_user, "telepon": tel}, headers=headers)
    assert r.status_code == 200, r.text
    assert r.json()["telepon"] == tel
    # verify in report
    rep = requests.get(f"{BASE_URL}/api/payroll/report?month={MONTH}", headers=headers).json()
    row = next((x for x in rep["rows"] if x["user_id"] == test_user), None)
    assert row is not None
    assert row["telepon"] == tel


# ---------- payroll/save with potongan_items + overridden counts ----------
def test_payroll_save_potongan_items_and_counts(headers, test_user):
    payload = {
        "user_id": test_user, "month": MONTH,
        "gaji_pokok": 2000000, "komisi": 0, "potongan": 50000,
        "bonus_items": [{"keterangan": "Lembur", "jumlah": 100000}],
        "potongan_items": [
            {"keterangan": "Kasbon", "jumlah": 150000},
            {"keterangan": "Barang rusak", "jumlah": 50000},
            {"keterangan": "", "jumlah": 0},  # should be dropped
        ],
        "hadir": 20, "telat": 2, "alpha": 1, "izin": 3,
    }
    r = requests.post(f"{BASE_URL}/api/payroll/save", json=payload, headers=headers)
    assert r.status_code == 200, r.text
    expected_total = 2000000 + 0 + 100000 - 50000 - (150000 + 50000)
    assert r.json()["total"] == expected_total

    rep = requests.get(f"{BASE_URL}/api/payroll/report?month={MONTH}", headers=headers).json()
    row = next(x for x in rep["rows"] if x["user_id"] == test_user)
    assert len(row["potongan_items"]) == 2
    assert row["potongan_lain"] == 200000
    assert row["total"] == expected_total
    # overridden counts persist
    assert row["hadir"] == 20
    assert row["telat"] == 2
    assert row["alpha"] == 1
    assert row["izin"] == 3
    # counts_auto present (from attendance; may be 0 for a fresh test user/month)
    assert "counts_auto" in row
    assert set(row["counts_auto"].keys()) == {"hadir", "telat", "alpha", "izin"}


# ---------- archive and delete ----------
def test_payroll_archive_then_delete(headers, test_user):
    # ensure override exists so there is a row to archive
    requests.post(f"{BASE_URL}/api/payroll/save", json={
        "user_id": test_user, "month": MONTH, "gaji_pokok": 1500000, "komisi": 0, "potongan": 0,
    }, headers=headers)

    r = requests.post(f"{BASE_URL}/api/payroll/archive", json={"month": MONTH}, headers=headers)
    assert r.status_code == 200, r.text
    assert r.json()["archived"] >= 1

    arcs = requests.get(f"{BASE_URL}/api/payroll/archives", headers=headers).json()
    assert any(a["month"] == MONTH for a in arcs), f"archive not listed: {arcs}"

    # check archive stores counts (persist hadir/telat/alpha/izin)
    rep = requests.get(f"{BASE_URL}/api/payroll/report?month={MONTH}", headers=headers).json()
    row = next(x for x in rep["rows"] if x["user_id"] == test_user)
    for k in ("hadir", "telat", "alpha", "izin"):
        assert k in row

    # DELETE
    r = requests.delete(f"{BASE_URL}/api/payroll/archive/{MONTH}", headers=headers)
    assert r.status_code == 200, r.text
    assert r.json()["ok"] is True
    assert r.json()["deleted"] >= 1

    arcs2 = requests.get(f"{BASE_URL}/api/payroll/archives", headers=headers).json()
    assert not any(a["month"] == MONTH for a in arcs2), "archive still listed after delete"


# ---------- admin only ----------
def test_payroll_delete_archive_requires_admin(headers):
    # make kasir user and login
    kasir = {"email": "test_iter21_kasir_only@example.com", "password": "test123", "name": "TEST_K21", "role": "kasir"}
    cr = requests.post(f"{BASE_URL}/api/users", json=kasir, headers=headers)
    if cr.status_code not in (200, 400, 409):
        pytest.skip("cannot create kasir")
    tok = requests.post(f"{BASE_URL}/api/auth/login", json={"email": kasir["email"], "password": kasir["password"]}).json()
    kt = tok.get("access_token") or tok.get("token")
    if not kt:
        pytest.skip("cannot login kasir")
    r = requests.delete(f"{BASE_URL}/api/payroll/archive/2099-01", headers={"Authorization": f"Bearer {kt}"})
    assert r.status_code in (401, 403)
    r2 = requests.post(f"{BASE_URL}/api/payroll/phone", json={"user_id": "x", "telepon": "0"}, headers={"Authorization": f"Bearer {kt}"})
    assert r2.status_code in (401, 403)
    # cleanup
    users = requests.get(f"{BASE_URL}/api/users", headers=headers).json()
    u = next((u for u in users if u["email"] == kasir["email"]), None)
    if u:
        requests.delete(f"{BASE_URL}/api/users/{u['id']}", headers=headers)
