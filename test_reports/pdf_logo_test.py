"""Test shelf label PDF logo embedding - frontend-driven download + pymupdf verify."""
import asyncio, os, pathlib, requests, fitz
from playwright.async_api import async_playwright

BASE = os.environ.get("REACT_APP_BACKEND_URL") or open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].splitlines()[0].strip()
EMAIL = "nannsond@gmail.com"
PASSWORD = "admin123"
LOGO = "/app/frontend/public/mulyatani-logo.png"
DL = pathlib.Path("/app/test_reports/downloads"); DL.mkdir(parents=True, exist_ok=True)

def api_login():
    r = requests.post(f"{BASE}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    r.raise_for_status(); return r.json()["token"]

def upload_logo(tok):
    with open(LOGO, "rb") as f:
        r = requests.post(f"{BASE}/api/settings/logo",
            headers={"Authorization": f"Bearer {tok}"},
            files={"file": ("mulyatani-logo.png", f, "image/png")}, timeout=30)
    print("upload_logo:", r.status_code, r.text[:200]); r.raise_for_status()

def analyze(path):
    doc = fitz.open(path)
    counts = [len(p.get_images(full=True)) for p in doc]
    doc.close(); return counts

async def download_label(page, out_path, size_key):
    # Open label size dropdown and select
    await page.locator('[data-testid="label-size-select"]').first.select_option(size_key)
    await page.wait_for_timeout(300)
    # Select all visible products
    sa = page.locator('[data-testid="label-select-all"]').first
    if await sa.is_visible():
        if not await sa.is_checked():
            await sa.click()
    await page.wait_for_timeout(200)
    async with page.expect_download(timeout=20000) as di:
        await page.locator('[data-testid="print-shelf-labels-button"]').first.click()
    d = await di.value
    await d.save_as(str(out_path))
    print(f"Downloaded {out_path.name}")

async def run():
    results = {}
    tok = api_login()
    print("Token acquired")

    async with async_playwright() as pw:
        browser = await pw.chromium.launch()
        ctx = await browser.new_context(accept_downloads=True, viewport={"width": 1920, "height": 1080})
        page = await ctx.new_page()
        page.on("pageerror", lambda e: print(f"PAGEERR: {e}"))

        # Login via UI
        await page.goto(BASE, wait_until="domcontentloaded")
        await page.wait_for_timeout(1500)
        # Try to find login form
        try:
            await page.fill('input[type="email"], input[name="email"]', EMAIL, timeout=5000)
            await page.fill('input[type="password"]', PASSWORD)
            await page.locator('button[type="submit"]').first.click()
            await page.wait_for_timeout(2500)
        except Exception as e:
            print("login attempt:", e)

        # Navigate to Daftar Harga
        try:
            await page.locator('a[href*="daftar-harga"], a:has-text("Daftar Harga")').first.click(timeout=5000)
        except Exception:
            await page.goto(BASE + "/daftar-harga")
        await page.wait_for_selector('[data-testid="print-shelf-labels-button"]', timeout=15000)
        await page.wait_for_timeout(500)

        # ---- Scenario A: NO LOGO ----
        print("\n=== Scenario A: No logo ===")
        f_no_5x3 = DL / "no_logo_5x3.pdf"
        await download_label(page, f_no_5x3, "5x3")
        f_no_4x2 = DL / "no_logo_4x2.pdf"
        await download_label(page, f_no_4x2, "4x2")
        results["no_logo_5x3_images_per_page"] = analyze(f_no_5x3)
        results["no_logo_4x2_images_per_page"] = analyze(f_no_4x2)

        # ---- Upload logo ----
        upload_logo(tok)
        await page.reload(); await page.wait_for_selector('[data-testid="print-shelf-labels-button"]', timeout=15000)
        await page.wait_for_timeout(800)

        # ---- Scenario B: WITH LOGO ----
        print("\n=== Scenario B: With logo ===")
        f_l_5x3 = DL / "with_logo_5x3.pdf"
        await download_label(page, f_l_5x3, "5x3")
        f_l_4x2 = DL / "with_logo_4x2.pdf"
        await download_label(page, f_l_4x2, "4x2")
        results["with_logo_5x3_images_per_page"] = analyze(f_l_5x3)
        results["with_logo_4x2_images_per_page"] = analyze(f_l_4x2)

        # Also test number of products shown to compare image counts
        # Count rows
        rows = await page.locator('[data-testid^="product-row-"]').count()
        results["product_rows_count"] = rows

        await browser.close()

    print("\n=== RESULTS ===")
    for k, v in results.items(): print(f"  {k}: {v}")

    # Assertions
    assert all(c == 0 for c in results["no_logo_5x3_images_per_page"]), "No-logo 5x3 should have NO images"
    assert all(c == 0 for c in results["no_logo_4x2_images_per_page"]), "No-logo 4x2 should have NO images"
    assert all(c == 0 for c in results["with_logo_4x2_images_per_page"]), "With-logo 4x2 (h<30) should have NO images"
    assert sum(results["with_logo_5x3_images_per_page"]) > 0, "With-logo 5x3 should have embedded images"
    print("\nALL ASSERTIONS PASSED")

asyncio.run(run())
