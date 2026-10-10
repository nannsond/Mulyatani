# Impor & Setup Aplikasi Mulyatani

Aplikasi laporan penjualan untuk toko pertanian: kasir (POS), daftar harga, stok opname, pembelian, penjualan online, gaji karyawan, dan laporan harian/bulanan/tahunan.
Proyek diambil dari GitHub (nannsond/Mulyatani, branch `conflict_091026_2223`), dipasang beserta semua dependensinya, lalu dijalankan di lingkungan ini.

## Untuk siapa
- Pemilik/admin toko pertanian yang mengelola produk, stok, gaji, dan laporan.
- Kasir yang mencatat transaksi harian dan absensi.

## Fitur inti & pengalaman (sesuai yang sudah ada di repo, tanpa fitur baru)
- Login email + password (peran admin & kasir).
- Dashboard: omzet hari ini, jumlah transaksi, stok menipis, grafik 7 hari, produk terlaris.
- Kasir (POS): cari produk, keranjang, metode bayar Tunai/Transfer/QRIS/kredit, ongkos kirim, stok berkurang otomatis.
- Daftar Harga: produk satuan & paket bundling, harga normal/reseller/online per platform, harga saran, ekspor PDF/Excel.
- Stok Opname, Pembelian (supplier tersimpan, scan barcode), Riwayat transaksi (edit/hapus).
- Penjualan Online per channel (Shopee, Tokopedia, Lazada, TikTok Shop) beserta potongan platform.
- Karyawan: kehadiran, komisi, rekap & arsip slip gaji.
- Pengantaran: daftar pesanan, WhatsApp pelanggan, arsip otomatis pesanan selesai > 3 hari.
- Laporan harian/bulanan/tahunan dan Laba Rugi (berbasis kas), ekspor PDF/Excel.

## Alur pengguna
1. Buka aplikasi → halaman login → masuk dengan akun admin awal.
2. Dashboard tampil → navigasi ke halaman lain (Kasir, Daftar Harga, Stok, Laporan, dsb.).
3. Admin menambahkan produk dan karyawan sendiri karena database dimulai kosong.

## Nuansa UI/UX
Tampilan dipertahankan persis seperti di repo (Bahasa Indonesia, format Rupiah). Tidak ada perubahan desain.

## Tahapan implementasi
- **Fase 1 (MVP — dikerjakan sekarang):** Impor kode dari branch tersebut; selesaikan otomatis semua penanda konflik merge dengan memilih versi terbaru yang paling lengkap; pasang semua dependensi backend & frontend; siapkan konfigurasi lingkungan; buat akun admin awal di database kosong; pastikan aplikasi berjalan dan semua halaman utama bisa dibuka tanpa error. Daftar file yang konflik dan cara penyelesaiannya dilaporkan di akhir.
- **Fase 2:** Uji menyeluruh setiap fitur (transaksi, stok, gaji, ekspor) dan perbaiki bug yang ditemukan.
- **Fase 3:** Penyempurnaan atau fitur baru sesuai permintaan, serta persiapan deploy.

## Asumsi
- Konflik merge diselesaikan otomatis dengan memilih versi terbaru dan paling lengkap. Jika kedua sisi berisi tambahan yang berbeda, keduanya digabung.
- Database dimulai kosong. Hanya satu akun admin awal yang dibuat, dan kredensialnya diberikan setelah setup selesai.
- Tidak ada fitur baru atau perubahan desain di Fase 1. Perbaikan hanya dilakukan jika diperlukan agar aplikasi bisa berjalan.
- Pekerjaan terjadwal yang sudah ada di repo (arsip otomatis pengantaran) ikut dipertahankan.
- Jika ada integrasi pihak ketiga di kode yang butuh kunci API yang belum tersedia, halaman tetap bisa dibuka. Fitur integrasi tersebut ditandai belum aktif dan dilaporkan.
- "Halaman utama bisa dibuka" berarti setiap menu navigasi bisa dibuka tanpa error. Ini tidak termasuk menguji setiap aksi di dalamnya.
