"""Pricing per-category target settings tests - iteration 25"""
import os
import pytest
import requests

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or
            open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split("\n")[0].strip()).rstrip("/")


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


def test_get_pricing_includes_categories(admin_token):
    r = requests.get(f"{BASE_URL}/api/pricing/settings", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    data = r.json()
    assert "categories" in data
    assert isinstance(data["categories"], dict)


def test_set_pricing_with_categories_admin(admin_token):
    payload = {
        "mode": "percent", "value": 25,
        "categories": {
            "benih": {"mode": "fixed", "value": 5000},
            "pupuk": {"mode": "percent", "value": 20},
            "paket": {"mode": "percent", "value": 15},
        }
    }
    r = requests.post(f"{BASE_URL}/api/pricing/settings", json=payload,
                      headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["categories"]["benih"] == {"mode": "fixed", "value": 5000}
    assert body["categories"]["pupuk"] == {"mode": "percent", "value": 20}

    # verify persistence
    r2 = requests.get(f"{BASE_URL}/api/pricing/settings", headers={"Authorization": f"Bearer {admin_token}"})
    cats = r2.json()["categories"]
    assert cats["benih"]["mode"] == "fixed"
    assert cats["benih"]["value"] == 5000
    assert cats["paket"]["value"] == 15


def test_set_pricing_categories_kasir_forbidden(kasir_token):
    r = requests.post(f"{BASE_URL}/api/pricing/settings",
                      json={"mode": "percent", "value": 25, "categories": {"benih": {"mode": "fixed", "value": 1000}}},
                      headers={"Authorization": f"Bearer {kasir_token}"})
    assert r.status_code == 403


def test_set_pricing_negative_category_clamped(admin_token):
    r = requests.post(f"{BASE_URL}/api/pricing/settings",
                      json={"mode": "percent", "value": 25,
                            "categories": {"benih": {"mode": "fixed", "value": -500}}},
                      headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert r.json()["categories"]["benih"]["value"] == 0


def test_restore_pricing_benih_5000(admin_token):
    # Restore to context expected by next iteration (default 25%, benih fixed 5000)
    r = requests.post(f"{BASE_URL}/api/pricing/settings",
                      json={"mode": "percent", "value": 25,
                            "categories": {"benih": {"mode": "fixed", "value": 5000}}},
                      headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
