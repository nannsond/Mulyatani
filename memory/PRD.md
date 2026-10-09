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

## Implemented (2026-10-08) — Karyawan: Komisi & Kehadiran
- Komisi Online (/komisi, admin): tarif global % dari laba kotor, hanya pesanan online "Selesai", dikreditkan ke karyawan penginput; rekap bulanan per karyawan (layar saja). Tested iter 9: 100%
- Kehadiran (/kehadiran, semua user): absen Masuk/Pulang mandiri (WIB), hitung durasi kerja & status Telat vs jam masuk standar (diatur admin, default 08:00); rekap bulanan per karyawan (admin) / milik sendiri (kasir). Tested iter 9: 100%

## Implemented (2026-10-08) — Penjualan Online lanjutan
- Status pesanan Diproses→Dikirim→Selesai→Dikembalikan; hanya "Selesai" masuk ke Laba Rugi + Dashboard + Laporan Harian/Bulanan/Tahunan (biaya marketplace mengurangi laba bersih)
- Refund: admin pilih kembalikan stok atau tidak (idempotent)
- Channel kustom (tambah/aktif/nonaktif/hapus) di Pengaturan; target omzet bulanan per channel + progress di Laporan Online; impor Excel massal + unduh template. Tested iter 8: 100%

## Implemented (2026-10-08) — Rekap Gaji (Payroll)
- Rekap Gaji (/rekap-gaji, admin): Gaji Pokok + Komisi Online − Potongan Telat = Total, semua bisa diedit owner; gaji pokok disimpan & dipakai ulang tiap bulan; potongan telat global (nominal × jumlah telat); tabel semua karyawan + cetak slip gaji PDF per karyawan. Tested iter 10: 100%
- Robustness: penjualan online kini menyimpan user_id; komisi & gaji diatribusikan per user_id (fallback nama utk data lama) agar karyawan bernama sama tidak tertukar.

## Implemented (2026-10-08) — Arsip Slip Gaji & Status Kehadiran
- Arsip Slip Gaji (/rekap-gaji, admin): tombol "Arsipkan Bulan Ini" menyimpan snapshot slip semua karyawan; kartu "Arsip Slip Gaji" menampilkan bulan terarsip (klik untuk buka & cetak ulang slip per karyawan). Tested iter 11: backend 100%
- Kehadiran status: Hadir (clock-in) / Izin / Sakit / Alpha. Karyawan bisa self-mark Izin/Sakit; admin "Tandai Kehadiran Karyawan" untuk siapa pun & tanggal apa pun. Rekap per status (hadir/telat/izin/sakit/alpha). Tested iter 11 + fix TZ.
- Fix: todayWIB() (UTC+7) untuk halaman kehadiran agar tanggal "hari ini" selaras dengan backend WIB (bug UTC vs WIB dekat tengah malam) — terverifikasi via UI.

## Implemented (2026-10-08) — Sortir Produk
- Daftar Harga: selektor urutan (Nama A-Z / Nama Z-A / Kategori) berlaku di tabel, cetak, & ekspor PDF/Excel.
- Backend GET /products: diurutkan kategori lalu nama (case-insensitive) sehingga dropdown produk di POS/Stok Opname/Penjualan Online juga rapi. Diverifikasi via curl + screenshot.

## Implemented (2026-10-08) — Stok Menipis
- Daftar Harga: produk dengan stok ≤ stok minimal diberi badge "Stok Menipis" (amber), stok = 0 diberi badge "Habis" (merah).
- Produk stok menipis/habis otomatis diurutkan ke paling atas (habis dulu, lalu menipis) terlepas dari pilihan urutan lain.
- Tombol filter "Hanya Stok Menipis" dengan counter jumlah; menampilkan hanya produk yang perlu di-restock. Diverifikasi via screenshot (badge, auto-sort, counter, filter).

## Implemented (2026-10-08) — Omzet Berbasis Kas (Piutang)
- Piutang (penjualan kredit POS) TIDAK langsung dihitung penuh sebagai omzet; hanya bagian yang sudah dibayar (amount_paid/total) yang diakui sebagai omzet.
- Pengakuan tetap di tanggal transaksi asli: saat piutang dilunasi, nilai pelunasan otomatis masuk omzet pada tanggal transaksi dibuat (bukan tanggal bayar).
- Laba ikut proporsional dengan porsi yang sudah dibayar (konsisten dengan omzet kas).
- Penjualan online "Selesai" tetap diakui penuh (tidak ada konsep piutang).
- Berlaku di: Dashboard, Laporan Harian/Bulanan/Tahunan, dan Laba Rugi. Diterapkan via helper `tx_fraction()` di server.py pada summarize/compute_profit/top_products/category_breakdown/product_profit/category_profit + loop harian/bulanan + dashboard series. Diverifikasi via curl: bayar separuh → omzet +½ & laba +½; lunasi → omzet & laba naik ke penuh.

## Implemented (2026-10-08) — Edit Kehadiran oleh Admin
- Admin bisa mengedit catatan kehadiran karyawan di tabel Detail Harian: ubah Status (Hadir/Izin/Sakit/Alpha) dan Jam Masuk/Pulang (khusus Hadir), serta hapus catatan.
- Backend: PUT /attendance/{id} & DELETE /attendance/{id} (admin-only). Edit menghitung ulang work_minutes & late (bandingkan jam masuk vs jam standar WIB); status non-Hadir otomatis mengosongkan jam & durasi.
- Diverifikasi via curl (edit 08:30→17:00 = 510 menit & late, ganti ke Izin mengosongkan jam, delete) + screenshot modal edit.

## Implemented (2026-10-08) — Harga Online per Produk
- Produk kini punya field `harga_online` sendiri (terpisah dari harga normal/reseller). Default halaman Penjualan Online memakai harga online produk (tetap bisa diedit saat input); jika belum diisi menampilkan "Harga online belum diatur" (nilai 0).
- Daftar Harga: tab baru "Harga Online" (biru) + kolom "Harga Online" di tabel ("belum diatur" bila 0) + input "Harga Online" di form produk; cetak/ekspor PDF mengikuti tab aktif.
- Backend: field `harga_online` ditambah di model Product & ProductInput. Diverifikasi via curl (persist 123.456) + screenshot Daftar Harga tab online & Penjualan Online.

## Implemented (2026-10-08) — Set Massal Harga Online
- Tombol "Set Massal" (admin, muncul di tab Harga Online) mengisi harga online banyak produk sekaligus dari Harga Normal: metode markup persen (%) atau nominal (Rp), dengan live preview.
- Berlaku ke produk yang sedang tampil (ikut filter pencarian/stok). Hasil dibulatkan ke Rp100 terdekat ("sesuai uang fisik").
- Backend: POST /products/bulk-online-price (admin-only). Diverifikasi via curl (+15% → pembulatan Rp100 akurat utk 3 produk) + screenshot modal (preview Rp10.000→Rp11.000, "Terapkan ke 12 Produk"). Data uji dikembalikan.

## Implemented (2026-10-08) — Kas Saat Ini (Uang Fisik) & hapus Set Massal
- Fitur "Set Massal Harga Online" DIHAPUS (frontend tombol/modal + backend endpoint `/products/bulk-online-price`).
- Kartu "Kas Saat Ini (Uang Fisik)" di halaman Laba Rugi: Kas = Saldo Awal + Omzet Diterima (kas) − Pembelian Dibayar − Pengeluaran − Biaya Marketplace. Semua basis kas & akumulasi seluruh periode (hutang pembelian/piutang belum dihitung sampai benar-benar dibayar).
- Input "Saldo Awal Kas" ditambah di Pengaturan (admin). Backend: GET /reports/cash + POST /settings/saldo-awal; `saldo_awal_kas` disimpan di settings & dikembalikan di GET /settings. Diverifikasi via curl (math benar) + screenshot kartu Kas & Pengaturan.

## Implemented (2026-10-08) — Edit Transaksi & Pembelian (admin), Kas Periode, fix modal
- **Riwayat Transaksi**: admin bisa Edit (item/qty/harga, diskon, pelanggan, metode bayar, jumlah bayar) & Hapus transaksi; stok otomatis disesuaikan (reverse lama, apply baru). Backend: PUT/DELETE /transactions/{id} (admin-only). Diverifikasi curl (stok 25→23→20→25) + screenshot.
- **Pembelian**: admin bisa Edit pembelian (supplier, item/qty/harga beli, catatan, jumlah dibayar); stok & harga_beli disesuaikan otomatis. Backend: PUT /purchases/{id} (admin-only). Diverifikasi curl (stok 25→35→29) + screenshot.
- **Kas Periode**: kartu Kas di Laba Rugi punya toggle "Total vs Periode Ini"; mode periode mengikuti Bulanan/Tahunan + bulan/tahun aktif, tanpa saldo awal (arus kas basis kas periode). Backend: GET /reports/cash?period=YYYY[-MM] + flag is_period.
- **Fix global modal**: keyframe `fade-up` di index.css diubah jadi opacity-only (hapus translateY). Sebelumnya `<main>` menyimpan transform identity (animation-fill both) yang membuat `position:fixed` modal mengacu ke <main> (halaman panjang → modal muncul jauh di bawah). Kini semua modal (Riwayat, Pembelian, Daftar Harga, Kehadiran) center di viewport.

## Implemented (2026-10-09) — Paket Bundling (Inventaris)
- Halaman Daftar Harga punya switch atas: **Produk Satuan** vs **Paket Bundling** (komponen BundlingPanel).
- Paket bundling tidak punya stok fisik sendiri; stok dihitung real-time = Min(floor(stok komponen / qty di paket)). Kartu paket menampilkan komposisi, stok terhitung (badge), dan indikator merah "Ada komponen habis" bila salah satu penyusun habis.
- Admin: CRUD paket (nama, harga jual manual, komponen produk+qty) + tombol **Kurangi Stok** (memotong stok tiap komponen sesuai qty).
- **POS**: paket tampil sebagai kartu "★ Paket Bundling" dan bisa dijual; saat terjual, stok tiap produk satuan penyusun otomatis terpotong (qty komponen × qty paket). Penjualan produk satuan otomatis memengaruhi ketersediaan paket.
- Backend: koleksi `bundles`; GET/POST/PUT/DELETE /bundles, POST /bundles/{id}/reduce; helper `_apply_sale_items`/`_restore_sale_items` menangani bundle di create/update/delete transaksi; CartItem punya `is_bundle`; item bundle menyimpan `hpp` (biaya = Σ harga_beli komponen) agar laba/HPP tetap akurat (compute_profit/product_profit/category_profit pakai fallback `i.hpp`).
- Diverifikasi curl (calc stok 12, hpp 35.000, jual 1 paket → komponen −2/−1, delete restore, reduce) + screenshot (panel bundling, modal, kartu POS).

## Implemented (2026-10-09) — Harga Paket Lengkap & Hemat Bundling
- Paket bundling kini punya 3 harga: Normal, **Reseller**, dan **Online** (input di modal BundlingPanel). Backend: BundleInput + _bundle_view + create/update menyimpan harga_reseller & harga_online.
- **POS**: paket mengikuti mode Normal/Reseller (pakai harga_reseller). **Penjualan Online**: paket kini tampil sebagai kartu "★ Paket Bundling" dan bisa dijual memakai harga_online; stok komponen otomatis terpotong, omzet/HPP/laba akurat, restore saat hapus/retur (pakai _apply_sale_items/_restore_sale_items; EcomItem punya is_bundle).
- **Diskon Paket Otomatis**: _bundle_view menghitung `harga_satuan_total` (Σ qty×harga_jual komponen) & `hemat` = max(0, satuan_total − harga_jual). Badge hijau "Hemat Rp…" tampil di kartu BundlingPanel, POS, dan Penjualan Online bila hemat>0.
- Diverifikasi curl (prices persist, hemat math, jual 2 paket online → komponen −2, omzet 220k/hpp 50k/laba 165k, delete restore) + screenshot (kartu paket di Penjualan Online).

## Implemented (2026-10-09) — Hapus Biaya Marketplace di Laba Rugi
- Baris "Biaya Marketplace" dihapus dari laporan Laba Rugi dan kartu Kas. Laba Bersih kini = Laba Kotor − Pengeluaran; Kas = Saldo Awal + Omzet − Pembelian − Pengeluaran (tanpa biaya marketplace).
- Backend: laba_bersih harian/bulanan/tahunan & kas_saat_ini tidak lagi mengurangi online_fee (field biaya_marketplace tetap ada untuk Laporan Online). Diverifikasi curl (laba_bersih==laba_kotor−pengeluaran, kas tanpa fee) + screenshot.

## Backlog (P1/P2)
- P1: Cetak struk/nota transaksi POS
- P1: Manajemen user (tambah kasir dari UI)
- P2: Target penjualan bulanan & perbandingan
- P2: Barcode scanner untuk POS
- P2: Margin keuntungan per laporan (harga beli vs jual)

## Implemented (2026-10-09) — Harga per Platform, Struk Manual, Filter & Hapus Massal Riwayat
- Products: `harga_channel` {channel: harga} — harga online berbeda per Shopee/Tokopedia/Lazada/TikTok Shop (kosong = pakai Harga Online). Daftar Harga tab Online menampilkan kolom per platform; modal produk punya input per platform. Penjualan Online memakai harga sesuai channel & re-price keranjang saat ganti channel.
- POS: struk tidak lagi otomatis terunduh setelah bayar; unduh lewat tombol "Cetak Struk PDF".
- Riwayat Transaksi: filter Semua/Tanggal/Bulan/Tahun + urutan terbaru/terlama (GET /transactions?date=&sort=); checklist + "Hapus Terpilih" (admin, stok dikembalikan). Tested iter 13: 100%

## Implemented (2026-10-09) — Potongan per Platform (Channel Fees)
- Tiap channel punya `fees` [{label, type percent|fixed, value, cap}] dengan default referensi kebijakan 2026 (non-Star/Mall): Shopee admin 8% + Gratis Ongkir XTRA 4% (maks 40rb) + proses pesanan Rp1.250; Tokopedia/TikTok Shop komisi 6.5% + layanan Xtra 4% (maks 40rb) + Rp1.250; Lazada komisi 6% + FSM 4% (maks 20rb) + Rp1.250.
- Pengaturan: editor potongan per channel (tambah/hapus/reset ke referensi). GET /channels/fee-defaults.
- Penjualan Online: potongan dihitung otomatis + rincian, bisa override manual; fee_breakdown disimpan. Impor Excel: admin_fee 0 → otomatis.
- Daftar Harga tab Online: estimasi "bersih" per platform (merah jika < harga beli). Tested iter 14: 100%
