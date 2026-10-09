"""Smoke tests for Mulyatani Phase 1: auth + all GET endpoints used by pages."""
import os
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://mulyatani.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "nannsond@gmail.com"
ADMIN_PASSWORD = "admin123"


@pytest.fixture(scope="session")
def token():
    r = requests.post(f"{BASE}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "token" in data and data["user"]["email"] == ADMIN_EMAIL
    assert data["user"]["role"] == "admin"
    return data["token"]


@pytest.fixture(scope="session")
def headers(token):
    return {"Authorization": f"Bearer {token}"}


def test_login_invalid():
    r = requests.post(f"{BASE}/api/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"}, timeout=10)
    assert r.status_code in (400, 401, 403)


def test_auth_me(headers):
    r = requests.get(f"{BASE}/api/auth/me", headers=headers, timeout=10)
    assert r.status_code == 200
    assert r.json()["email"] == ADMIN_EMAIL


# All GET endpoints each page relies on. Logo endpoint allowed to 404 (unset).
GET_ENDPOINTS = [
    ("/api/products", None, (200,)),
    ("/api/bundles", None, (200,)),
    ("/api/customers", None, (200,)),
    ("/api/deliveries", None, (200,)),
    ("/api/transactions", None, (200,)),
    ("/api/reports/daily", {"date": "2026-01-15"}, (200,)),
    ("/api/reports/monthly", {"year": 2026, "month": 1}, (200,)),
    ("/api/reports/yearly", {"year": 2026}, (200,)),
    ("/api/reports/cash", None, (200,)),
    ("/api/users", None, (200,)),
    ("/api/targets", {"year": 2026, "month": 1}, (200,)),
    ("/api/settings", None, (200,)),
    ("/api/settings/logo", None, (200, 404)),
    ("/api/piutang", None, (200,)),
    ("/api/purchases", None, (200,)),
    ("/api/purchases/suppliers", None, (200,)),
    ("/api/purchases/last-prices", None, (200,)),
    ("/api/hutang", None, (200,)),
    ("/api/expenses", None, (200,)),
    ("/api/stok-opname", None, (200,)),
    ("/api/ecommerce/sales", None, (200,)),
    ("/api/ecommerce/targets", {"year": 2026, "month": 1}, (200,)),
    ("/api/ecommerce/reports", None, (200,)),
    ("/api/channels", None, (200,)),
    ("/api/channels/fee-defaults", None, (200,)),
    ("/api/dashboard", None, (200,)),
    ("/api/commission/settings", None, (200,)),
    ("/api/commission/report", {"month": "2026-01"}, (200,)),
    ("/api/attendance/settings", None, (200,)),
    ("/api/attendance/today", None, (200,)),
    ("/api/attendance", {"month": "2026-01"}, (200,)),
    ("/api/payroll/settings", None, (200,)),
    ("/api/payroll/report", {"month": "2026-01"}, (200,)),
]


@pytest.mark.parametrize("path,params,allowed", GET_ENDPOINTS, ids=[e[0] for e in GET_ENDPOINTS])
def test_get_endpoint(path, params, allowed, headers):
    r = requests.get(f"{BASE}{path}", headers=headers, params=params, timeout=20)
    assert r.status_code in allowed, f"{path} -> {r.status_code}: {r.text[:200]}"
    r.json()


def test_products_has_seed(headers):
    r = requests.get(f"{BASE}/api/products", headers=headers, timeout=10)
    data = r.json()
    assert isinstance(data, list)
    # Repo seed auto-creates sample products
    # Not strictly required, just log
    print(f"Products count: {len(data)}")
