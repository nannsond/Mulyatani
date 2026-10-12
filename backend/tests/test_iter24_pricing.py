"""Pricing target settings tests - iteration 24"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL") or open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split("\n")[0].strip()
BASE_URL = BASE_URL.rstrip("/")


def login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_token():
    return login("nannsond@gmail.com", "admin123")


@pytest.fixture(scope="module")
def kasir_token():
    return login("kasir@tokotani.com", "kasir123")


def test_get_pricing_settings(admin_token):
    r = requests.get(f"{BASE_URL}/api/pricing/settings", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    data = r.json()
    assert "mode" in data and "value" in data
    assert data["mode"] in ("percent", "fixed")


def test_set_pricing_as_admin_percent(admin_token):
    r = requests.post(f"{BASE_URL}/api/pricing/settings",
                      json={"mode": "percent", "value": 30},
                      headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert r.json()["mode"] == "percent"
    assert r.json()["value"] == 30
    # verify persistence
    r2 = requests.get(f"{BASE_URL}/api/pricing/settings", headers={"Authorization": f"Bearer {admin_token}"})
    assert r2.json()["mode"] == "percent"
    assert r2.json()["value"] == 30


def test_set_pricing_as_admin_fixed(admin_token):
    r = requests.post(f"{BASE_URL}/api/pricing/settings",
                      json={"mode": "fixed", "value": 5000},
                      headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert r.json()["mode"] == "fixed"
    assert r.json()["value"] == 5000


def test_set_pricing_kasir_forbidden(kasir_token):
    r = requests.post(f"{BASE_URL}/api/pricing/settings",
                      json={"mode": "percent", "value": 10},
                      headers={"Authorization": f"Bearer {kasir_token}"})
    assert r.status_code == 403


def test_set_pricing_negative_coerced(admin_token):
    r = requests.post(f"{BASE_URL}/api/pricing/settings",
                      json={"mode": "percent", "value": -10},
                      headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert r.json()["value"] == 0


def test_restore_pricing_target_25(admin_token):
    r = requests.post(f"{BASE_URL}/api/pricing/settings",
                      json={"mode": "percent", "value": 25},
                      headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
