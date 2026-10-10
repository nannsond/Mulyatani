"""Seed small SAMPLE data via API. SKUs prefixed CONTOH- for easy removal."""
import os, sys, requests

API = sys.argv[1] + "/api"
tok = requests.post(f"{API}/auth/login", json={"email": "nannsond@gmail.com", "password": "admin123"}).json()["token"]
H = {"Authorization": f"Bearer {tok}"}

products = [
    ("CONTOH-001", "Pupuk Urea 1kg (Contoh)", "Pupuk", "kg", 8000, 11000, 10000, 12500, 50),
    ("CONTOH-002", "Pupuk NPK Mutiara 1kg (Contoh)", "Pupuk", "kg", 14000, 19000, 17500, 21000, 40),
    ("CONTOH-003", "Benih Cabai Rawit (Contoh)", "Benih", "pcs", 15000, 22000, 20000, 25000, 30),
    ("CONTOH-004", "Insektisida 100ml (Contoh)", "Pestisida", "botol", 25000, 35000, 32000, 39000, 3),
    ("CONTOH-005", "Polybag 25x25 (Contoh)", "Alat", "pak", 10000, 15000, 13500, 17000, 25),
]
ids = {}
existing = {p["sku"]: p["id"] for p in requests.get(f"{API}/products", headers=H).json()}
for sku, name, cat, unit, hb, hj, hr, ho, stok in products:
    if sku in existing:
        ids[sku] = existing[sku]; continue
    r = requests.post(f"{API}/products", headers=H, json=dict(sku=sku, name=name, category=cat, unit=unit,
        harga_beli=hb, harga_jual=hj, harga_reseller=hr, harga_online=ho, stok=stok, stok_minimal=5))
    ids[sku] = r.json()["id"]

if not any("(Contoh)" in b["name"] for b in requests.get(f"{API}/bundles", headers=H).json()):
    requests.post(f"{API}/bundles", headers=H, json=dict(name="Paket Tanam Cabai (Contoh)", harga_jual=50000,
        harga_reseller=46000, harga_online=56000, components=[
            dict(product_id=ids["CONTOH-002"], qty=1), dict(product_id=ids["CONTOH-003"], qty=1),
            dict(product_id=ids["CONTOH-005"], qty=1)]))

for items, extra in [
    ([dict(product_id=ids["CONTOH-001"], name="Pupuk Urea 1kg (Contoh)", harga=11000, qty=3)], {}),
    ([dict(product_id=ids["CONTOH-002"], name="Pupuk NPK Mutiara 1kg (Contoh)", harga=19000, qty=2), dict(product_id=ids["CONTOH-004"], name="Insektisida 100ml (Contoh)", harga=35000, qty=1)],
     dict(customer_name="Pak Budi (Contoh)", telepon="081200000001", alamat="Desa Contoh RT 01", ongkir=10000)),
]:
    r = requests.post(f"{API}/transactions", headers=H, json=dict(items=items, payment_method="Tunai", **extra))
    print(r.status_code, r.text[:120])
print("done")
