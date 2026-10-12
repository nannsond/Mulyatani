"""Verify colored category stripe on left edge of shelf label PDFs."""
import pymupdf
import os

DPI = 200
MM_PX = DPI / 25.4

# Expected colors per category (as per CATEGORY_COLORS in exporter.js)
EXPECTED = {
    "Pupuk": (27, 94, 59),
    "Benih": (217, 119, 6),
    "Pestisida": (200, 40, 40),
    "Alat Tani": (37, 99, 235),
    "Paket": (124, 58, 237),
}

SIZES = {
    "4x2": (40, 20),
    "3x1.5": (30, 15),
    "5x3": (50, 30),
}


def sample_rgb(pix, x_mm, y_mm):
    x = int(round(x_mm * MM_PX))
    y = int(round(y_mm * MM_PX))
    # Clamp
    x = max(0, min(pix.width - 1, x))
    y = max(0, min(pix.height - 1, y))
    i = (y * pix.width + x) * pix.n
    s = pix.samples
    return (s[i], s[i + 1], s[i + 2])


def nearest(rgb):
    best, bd = None, 1e9
    for name, c in EXPECTED.items():
        d = sum((a - b) ** 2 for a, b in zip(rgb, c))
        if d < bd:
            bd, best = d, name
    return best, bd


def verify(path, size_key, categories):
    w_mm, h_mm = SIZES[size_key]
    cols = max(1, 200 // w_mm)
    rows_lbl = max(1, 287 // h_mm)
    x0 = (210 - cols * w_mm) / 2
    y0 = (297 - rows_lbl * h_mm) / 2
    s = min(h_mm / 20, w_mm / 40)
    sw = max(1.2, 1.5 * s)  # stripe width mm

    doc = pymupdf.open(path)
    page = doc[0]
    pix = page.get_pixmap(dpi=DPI)
    results = []
    # Sample for each expected category index
    for idx, cat in enumerate(categories):
        if idx >= cols * rows_lbl:
            break
        col = idx % cols
        row = idx // cols
        lx = x0 + col * w_mm
        ly = y0 + row * h_mm
        # Sample inside the stripe (center of stripe width, center of label height)
        sx = lx + sw / 2
        sy = ly + h_mm / 2
        rgb = sample_rgb(pix, sx, sy)
        guess, dist = nearest(rgb)
        exp = EXPECTED.get(cat)
        ok = exp and sum((a - b) ** 2 for a, b in zip(rgb, exp)) < 1200
        results.append({"idx": idx, "cat": cat, "sampled_rgb": rgb, "expected": exp, "nearest": guess, "ok": ok})
    doc.close()
    return results


def main():
    base = "/app/test_reports/downloads/iter10"
    # product order from GET /api/products — need to match; use empirical: it's whatever backend returns
    # From our test: ZA(Pupuk), TEST_Benih, TEST_Pestisida, TEST_Alat (Alat Tani)
    # But actual DaftarHarga sorts by name A-Z default:
    # Names: "TEST_Alat", "TEST_Benih", "TEST_Pestisida", "ZA"
    # So order: TEST_Alat(Alat Tani), TEST_Benih(Benih), TEST_Pestisida(Pestisida), ZA(Pupuk)
    satuan_cats = ["Alat Tani", "Benih", "Pestisida", "Pupuk"]
    bundle_cats = ["Paket"]

    print("=== SATUAN ===")
    for sk in ["4x2", "3x1.5", "5x3"]:
        p = f"{base}/satuan_{sk}.pdf"
        if not os.path.exists(p):
            print(f"MISSING {p}"); continue
        res = verify(p, sk, satuan_cats)
        print(f"\n{sk}:")
        for r in res:
            print(f"  idx={r['idx']} cat={r['cat']} sampled={r['sampled_rgb']} expected={r['expected']} nearest={r['nearest']} OK={r['ok']}")

    print("\n=== BUNDLE ===")
    for sk in ["4x2", "3x1.5", "5x3"]:
        p = f"{base}/bundle_{sk}.pdf"
        if not os.path.exists(p):
            print(f"MISSING {p}"); continue
        res = verify(p, sk, bundle_cats)
        print(f"\n{sk}:")
        for r in res:
            print(f"  idx={r['idx']} cat={r['cat']} sampled={r['sampled_rgb']} expected={r['expected']} nearest={r['nearest']} OK={r['ok']}")


if __name__ == "__main__":
    main()
