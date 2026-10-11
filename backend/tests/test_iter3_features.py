"""Backend tests for iteration 3 new features:
- GET /api/transactions (list, q param)
- POST /api/targets with month:0 (yearly target), GET /api/reports/yearly returns target_omzet
- product_laba in monthly + yearly reports
- POST /api/settings/logo (admin), GET /api/settings/logo (public), GET /api/settings has_logo
- Kasir role 403 on POST /api/settings/logo
"""
import io
import os

import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
ADMIN = {"email": "nannsond@gmail.com", "password": "admin123"}
KASIR = {"email": "kasir@tokotani.com", "password": "kasir123"}


def _login(creds):
    r = requests.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_h():
    return {"Authorization": f"Bearer {_login(ADMIN)}"}


@pytest.fixture(scope="module")
def kasir_h():
    return {"Authorization": f"Bearer {_login(KASIR)}"}


# ---------- Riwayat Transaksi: GET /api/transactions ----------
class TestTransactionsList:
    def test_list_transactions_limit(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/transactions?limit=100", headers=admin_h)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) > 0
        t = data[0]
        for key in ("id", "invoice_no", "items", "total", "payment_method", "cashier_name", "created_at"):
            assert key in t
        # mongo _id should not be in response
        assert "_id" not in t

    def test_list_transactions_search_q(self, admin_h):
        # fetch first list, use substring of invoice_no
        r = requests.get(f"{BASE_URL}/api/transactions?limit=5", headers=admin_h)
        inv = r.json()[0]["invoice_no"]
        prefix = inv[:12]  # e.g. INV-20261008
        r2 = requests.get(f"{BASE_URL}/api/transactions?q={prefix}&limit=100", headers=admin_h)
        assert r2.status_code == 200
        results = r2.json()
        assert len(results) > 0
        for t in results:
            assert prefix in t["invoice_no"]

    def test_list_transactions_q_no_match(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/transactions?q=ZZNOMATCH", headers=admin_h)
        assert r.status_code == 200
        assert r.json() == []

    def test_kasir_can_list_transactions(self, kasir_h):
        r = requests.get(f"{BASE_URL}/api/transactions?limit=10", headers=kasir_h)
        assert r.status_code == 200


# ---------- Yearly target (month:0) & yearly report ----------
class TestYearlyTarget:
    def test_set_yearly_target_admin(self, admin_h):
        payload = {"year": 2026, "month": 0, "target_omzet": 123456789}
        r = requests.post(f"{BASE_URL}/api/targets", headers=admin_h, json=payload)
        assert r.status_code == 200
        # Verify via yearly report
        r2 = requests.get(f"{BASE_URL}/api/reports/yearly?year=2026", headers=admin_h)
        assert r2.status_code == 200
        data = r2.json()
        assert data["target_omzet"] == 123456789
        assert "summary" in data
        assert len(data["monthly"]) == 12
        for m in data["monthly"]:
            assert set(m.keys()) >= {"month", "omzet", "transaksi", "laba"}

    def test_kasir_cannot_set_yearly_target(self, kasir_h):
        r = requests.post(f"{BASE_URL}/api/targets", headers=kasir_h,
                          json={"year": 2026, "month": 0, "target_omzet": 1})
        assert r.status_code == 403

    def test_get_yearly_target(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/targets?year=2026&month=0", headers=admin_h)
        assert r.status_code == 200
        assert r.json()["target_omzet"] == 123456789


# ---------- product_laba in monthly + yearly reports ----------
class TestProductLaba:
    def test_monthly_product_laba(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/reports/monthly?year=2026&month=10", headers=admin_h)
        assert r.status_code == 200
        pl = r.json().get("product_laba")
        assert pl is not None
        assert "tertinggi" in pl and "terendah" in pl
        assert isinstance(pl["tertinggi"], list)
        assert isinstance(pl["terendah"], list)
        if pl["tertinggi"]:
            item = pl["tertinggi"][0]
            for k in ("name", "qty", "omzet", "laba"):
                assert k in item

    def test_yearly_product_laba(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/reports/yearly?year=2026", headers=admin_h)
        assert r.status_code == 200
        pl = r.json().get("product_laba")
        assert pl is not None
        assert "tertinggi" in pl and "terendah" in pl
        assert len(pl["tertinggi"]) > 0  # 2026 has seeded data


# ---------- Logo settings ----------
class TestLogoSettings:
    def test_get_settings_has_logo_flag(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/settings", headers=admin_h)
        assert r.status_code == 200
        data = r.json()
        assert "has_logo" in data

    def test_get_logo_public(self):
        # No auth needed per spec
        r = requests.get(f"{BASE_URL}/api/settings/logo")
        # If logo set it should return 200 with image; if not, 404
        assert r.status_code in (200, 404)
        if r.status_code == 200:
            ct = r.headers.get("Content-Type", "")
            assert ct.startswith("image/")
            assert len(r.content) > 0

    def test_kasir_cannot_upload_logo(self, kasir_h):
        # Minimal 1x1 png
        png = (b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
               b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8\xcf"
               b"\xc0\x00\x00\x00\x03\x00\x01\x8d\xe6:\xdd\x00\x00\x00\x00IEND\xaeB`\x82")
        files = {"file": ("x.png", io.BytesIO(png), "image/png")}
        r = requests.post(f"{BASE_URL}/api/settings/logo", headers=kasir_h, files=files)
        assert r.status_code == 403

    def test_admin_upload_logo(self, admin_h):
        png = (b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
               b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8\xcf"
               b"\xc0\x00\x00\x00\x03\x00\x01\x8d\xe6:\xdd\x00\x00\x00\x00IEND\xaeB`\x82")
        files = {"file": ("logo_test.png", io.BytesIO(png), "image/png")}
        r = requests.post(f"{BASE_URL}/api/settings/logo", headers=admin_h, files=files)
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True
        # Verify
        r2 = requests.get(f"{BASE_URL}/api/settings", headers=admin_h)
        assert r2.json()["has_logo"] is True
        r3 = requests.get(f"{BASE_URL}/api/settings/logo")
        assert r3.status_code == 200
        assert r3.headers.get("Content-Type", "").startswith("image/")

    def test_logo_invalid_format(self, admin_h):
        files = {"file": ("bad.txt", io.BytesIO(b"not an image"), "text/plain")}
        r = requests.post(f"{BASE_URL}/api/settings/logo", headers=admin_h, files=files)
        assert r.status_code == 400
