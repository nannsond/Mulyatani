# PRD - Toko Tani Makmur (Aplikasi Laporan Penjualan Toko Pertanian)

## Problem Statement
Aplikasi laporan penjualan sederhana untuk bisnis toko pertanian: laporan harian, bulanan, tahunan, stok opname, dan daftar harga.

## User Choices
- Auth: JWT email+password (admin/kasir)
- Input transaksi manual (POS)
- Stok opname dengan penyesuaian stok fisik vs sistem
- Mata uang Rupiah, Bahasa Indonesia
- Ekspor PDF & Excel

## Architecture
- Backend: FastAPI + MongoDB (motor), JWT Bearer auth (localStorage), bcrypt.
- Frontend: React 19 (Vite) + Tailwind v4 + shadcn + Recharts + Sonner. Export via jsPDF/jspdf-autotable + xlsx.
- Auth: Bearer token in Authorization header; AuthContext + ProtectedRoute.

## User Personas
- Admin/Pemilik: akses penuh termasuk CRUD produk & daftar harga.
- Kasir: transaksi penjualan, stok opname, lihat laporan; tanpa CRUD produk.

## Implemented (2026-06-08)
- JWT login + seed admin (nannsond@gmail.com) & kasir (kasir@tokotani.com)
- Dashboard: omzet hari ini, transaksi, total produk, stok menipis, grafik 7 hari, produk terlaris
- POS Kasir: cari produk, keranjang, qty, metode bayar (Tunai/Transfer/QRIS), checkout, auto-kurang stok
- Daftar Harga: CRUD produk (admin), kategori, harga beli/jual, stok minimal; ekspor PDF/Excel
- Stok Opname: stok sistem vs fisik, selisih badge, alasan, auto-sesuaikan stok, riwayat; ekspor PDF/Excel
- Laporan Harian/Bulanan/Tahunan: filter, summary, grafik, top produk, kategori; ekspor PDF/Excel
- Seed ~2 tahun data transaksi dengan musiman (musim tanam/panen)

## Test Credentials
- Admin: nannsond@gmail.com / admin123
- Kasir: kasir@tokotani.com / kasir123

## Implemented (2026-10-08) — Penjualan Online (Multi-Marketplace)
- Input manual penjualan per channel: Shopee, Tokopedia, Lazada, TikTok Shop (halaman /penjualan-online)
- Potong stok dari produk yang sama dengan toko fisik; hapus penjualan (admin) mengembalikan stok
- Catat biaya marketplace per transaksi: biaya admin, ongkir, biaya lain → laba bersih akurat
- Laporan Online (/laporan/online): mode Harian/Bulanan/Tahunan, kartu ringkasan, grafik perbandingan per channel, tren omzet, tabel rincian per channel + TOTAL; ekspor PDF/Excel
- Backend: POST/GET/DELETE /api/ecommerce/sales, GET /api/ecommerce/reports (agregasi per channel + gabungan). Tested iter 7: 100%

## Backlog (P1/P2)
- P1: Cetak struk/nota transaksi POS
- P1: Manajemen user (tambah kasir dari UI)
- P2: Target penjualan bulanan & perbandingan
- P2: Barcode scanner untuk POS
- P2: Margin keuntungan per laporan (harga beli vs jual)
