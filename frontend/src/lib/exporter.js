import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { terbilang } from "./terbilang";

export function exportPDF({ title, subtitle, columns, rows, foot }) {
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.setTextColor(27, 94, 59);
  doc.text("Toko Tani Makmur", 14, 16);
  doc.setFontSize(12);
  doc.setTextColor(40, 40, 40);
  doc.text(title, 14, 24);
  if (subtitle) {
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text(subtitle, 14, 30);
  }
  autoTable(doc, {
    startY: subtitle ? 34 : 30,
    head: [columns],
    body: rows,
    foot: foot ? [foot] : undefined,
    headStyles: { fillColor: [27, 94, 59] },
    footStyles: { fillColor: [232, 240, 236], textColor: [15, 40, 30], fontStyle: "bold" },
    styles: { fontSize: 8 },
  });
  doc.save(`${title.replace(/\s+/g, "_")}.pdf`);
}

export function exportExcel({ filename, sheetName, columns, rows }) {
  const data = [columns, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName || "Sheet1");
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

const rp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");

function loadImageData(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width; canvas.height = img.height;
      canvas.getContext("2d").drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = reject;
    img.src = url;
  });
}

export async function printReceipt(tx, logoUrl, info = {}) {
  const lineH = 5;
  const itemsCount = tx.items.length;
  const height = 140 + itemsCount * 8;
  const doc = new jsPDF({ unit: "mm", format: [80, height] });
  let y = 8;
  if (logoUrl) {
    try {
      const dataUrl = await loadImageData(logoUrl);
      doc.addImage(dataUrl, "PNG", 30, y, 20, 20); y += 23;
    } catch (e) { /* abaikan error muat logo */ }
  }
  doc.setFont("courier", "bold");
  doc.setFontSize(12);
  doc.text((info.store_name || "TOKO TANI MAKMUR").toUpperCase(), 40, y, { align: "center" }); y += 5;
  doc.setFont("courier", "normal");
  doc.setFontSize(7);
  if (info.address) {
    const lines = doc.splitTextToSize(info.address, 68);
    doc.text(lines, 40, y, { align: "center" }); y += 3.5 * lines.length;
  }
  if (info.phone) { doc.text(`Telp: ${info.phone}`, 40, y, { align: "center" }); y += 4; }
  y += 1;
  doc.setFontSize(8);
  doc.text(`No: ${tx.invoice_no}`, 5, y); y += lineH - 1;
  const d = new Date(tx.created_at);
  doc.text(`Tgl: ${d.toLocaleString("id-ID")}`, 5, y); y += lineH - 1;
  doc.text(`Kasir: ${tx.cashier_name}`, 5, y); y += lineH - 1;
  doc.text("--------------------------------", 5, y); y += lineH - 1;
  tx.items.forEach((i) => {
    doc.text(i.name.slice(0, 32), 5, y); y += 4;
    doc.text(`${i.qty} x ${rp(i.harga)}`, 5, y);
    doc.text(rp(i.subtotal), 75, y, { align: "right" }); y += lineH;
  });
  doc.text("--------------------------------", 5, y); y += lineH;
  if ((tx.discount && tx.discount > 0) || (tx.ongkir && tx.ongkir > 0)) {
    doc.setFont("courier", "normal"); doc.setFontSize(8);
    doc.text("Subtotal", 5, y); doc.text(rp(tx.subtotal || tx.total), 75, y, { align: "right" }); y += 4;
    if (tx.discount && tx.discount > 0) {
      doc.text("Diskon", 5, y); doc.text("-" + rp(tx.discount), 75, y, { align: "right" }); y += 4;
    }
    if (tx.ongkir && tx.ongkir > 0) {
      doc.text("Ongkir", 5, y); doc.text("+" + rp(tx.ongkir), 75, y, { align: "right" }); y += 4;
    }
  }
  doc.setFont("courier", "bold");
  doc.setFontSize(10);
  doc.text("TOTAL", 5, y);
  doc.text(rp(tx.total), 75, y, { align: "right" }); y += lineH + 1;
  doc.setFont("courier", "normal");
  doc.setFontSize(8);
  doc.text(`Pembayaran: ${tx.payment_method}`, 5, y); y += lineH - 1;
  if (tx.customer_name) { doc.text(`Pelanggan: ${tx.customer_name}`, 5, y); y += 4; }
  if (tx.alamat) {
    const al = doc.splitTextToSize(`Alamat: ${tx.alamat}`, 70);
    doc.text(al, 5, y); y += 4 * al.length;
  }
  if (tx.telepon) { doc.text(`HP: ${tx.telepon}`, 5, y); y += 4; }
  if (tx.status && tx.status !== "lunas") {
    doc.text(`Dibayar: ${rp(tx.amount_paid || 0)}`, 5, y); y += 4;
    doc.text(`Sisa (Piutang): ${rp((tx.total || 0) - (tx.amount_paid || 0))}`, 5, y); y += 4;
  }
  y += 2;
  doc.text("Terima kasih atas kunjungan Anda!", 40, y, { align: "center" });
  doc.save(`Struk_${tx.invoice_no}.pdf`);
}

export async function printPriceList({ products, channels = [], logoUrl, info }) {
  const doc = new jsPDF();
  if (logoUrl) { try { const d = await loadImageData(logoUrl); doc.addImage(d, "PNG", 14, 8, 16, 16); } catch (e) { /* skip */ } }
  const x = logoUrl ? 34 : 14;
  doc.setFontSize(15); doc.setTextColor(27, 94, 59);
  doc.text(info?.store_name || "Toko Tani Makmur", x, 16);
  let hy = 22; doc.setFontSize(9); doc.setTextColor(90, 90, 90);
  if (info?.address) { doc.text(info.address, x, hy); hy += 5; }
  if (info?.phone) { doc.text("Telp: " + info.phone, x, hy); hy += 5; }
  doc.setFontSize(12); doc.setTextColor(20, 20, 20);
  doc.text("DAFTAR HARGA", 14, hy + 4);
  const cols = ["SKU", "Produk", "Kategori", "Satuan", "Normal", "Reseller", ...channels.map((c) => c.name)];
  const rows = products.map((p) => [p.sku, p.name, p.category, p.unit, ...[p.harga_jual, p.harga_reseller || 0, ...channels.map((c) => p.harga_channel?.[c.name] || 0)].map(rp)]);
  autoTable(doc, { startY: hy + 8, head: [cols], body: rows, headStyles: { fillColor: [27, 94, 59] }, styles: { fontSize: 8 } });
  doc.save("Daftar_Harga.pdf");
}

const NAVY = [31, 56, 100];

function slipTable(doc, y, head, body, totalLabel, totalValue) {
  autoTable(doc, {
    startY: y,
    head: [[head, "Perhitungan", "Jumlah"]],
    body,
    foot: [[totalLabel, "", totalValue]],
    theme: "grid",
    headStyles: { fillColor: NAVY, textColor: 255, fontStyle: "bold" },
    footStyles: { fillColor: [242, 242, 242], textColor: [20, 20, 20], fontStyle: "bold" },
    columnStyles: { 0: { cellWidth: 62 }, 2: { halign: "right", cellWidth: 40 } },
    styles: { fontSize: 10, lineColor: [190, 190, 190], lineWidth: 0.2, cellPadding: 2.5 },
    didParseCell: (d) => { if (d.column.index === 2 && d.section !== "body") d.cell.styles.halign = "right"; },
  });
  return doc.lastAutoTable.finalY;
}

const sectionTitle = (doc, text, y) => {
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...NAVY);
  doc.text(text, 14, y);
};

export async function printPayslip({ row, monthLabel, info, logoUrl, payroll = {} }) {
  const doc = new jsPDF();
  const W = doc.internal.pageSize.getWidth();
  let y = 14;
  if (logoUrl) { try { const d = await loadImageData(logoUrl); doc.addImage(d, "PNG", 14, 10, 18, 18); } catch (e) { /* skip */ } }
  doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(20, 20, 20);
  doc.text("SLIP GAJI KARYAWAN", W / 2, y + 4, { align: "center" }); y += 11;
  doc.setFont("helvetica", "normal"); doc.setFontSize(11);
  doc.text(info?.store_name || "Toko Tani Makmur", W / 2, y, { align: "center" }); y += 5;
  doc.setFontSize(9); doc.setTextColor(90, 90, 90);
  if (info?.address) { doc.text(info.address, W / 2, y, { align: "center" }); y += 4.5; }
  doc.setFontSize(10); doc.setTextColor(40, 40, 40);
  doc.text(`Periode: ${monthLabel}`, W / 2, y + 1, { align: "center" }); y += 5;
  doc.setDrawColor(...NAVY); doc.setLineWidth(0.6); doc.line(14, y, W - 14, y); y += 9;

  sectionTitle(doc, "DATA KARYAWAN", y); y += 6;
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(30, 30, 30);
  [["Nama Karyawan", row.user_name], ["Jabatan", row.role === "admin" ? "Admin" : "Kasir"],
   ["Kehadiran", `Hadir ${row.hadir || 0} hari • Telat ${row.telat || 0} kali • Alpha ${row.alpha || 0} hari • Izin/Sakit ${row.izin || 0} hari`]]
    .forEach(([k, v]) => { doc.text(k, 14, y); doc.text(`: ${v}`, 52, y); y += 5.5; });
  y += 4;

  const hk = payroll.hari_kerja || 26;
  const pend = [["Gaji Pokok Bulanan", `${hk} Hari Kerja`, rp(row.gaji_pokok)]];
  if (row.komisi > 0) pend.push(["Bonus", "Komisi Penjualan Online", rp(row.komisi)]);
  (row.bonus_items || []).forEach((b) => pend.push(["Bonus", b.keterangan || "-", rp(b.jumlah)]));
  const bruto = (row.gaji_pokok || 0) + (row.komisi || 0) + (row.bonus_items || []).reduce((s, b) => s + (Number(b.jumlah) || 0), 0);
  sectionTitle(doc, "RINCIAN PENDAPATAN", y);
  y = slipTable(doc, y + 3, "Komponen Pendapatan", pend, "TOTAL PENDAPATAN KOTOR", rp(bruto)) + 9;

  const harian = Math.round((row.gaji_pokok || 0) / hk);
  const absen = (row.alpha || 0) + (row.izin || 0);
  const potAlpha = Math.round(absen * (row.gaji_pokok || 0) / hk);
  const potTelat = (row.telat || 0) * (payroll.potongan_telat || 0);
  const autoPot = potAlpha + Math.round(potTelat);
  const pot = [];
  if (Math.round(row.potongan || 0) === autoPot) {
    pot.push(["Potongan Absensi", `${absen} Hari (Alpha ${row.alpha || 0}, Izin/Sakit ${row.izin || 0}) x ${rp(harian)}`, potAlpha ? rp(potAlpha) : "-"]);
    if (potTelat > 0)
      pot.push(["Potongan Keterlambatan", `${row.telat || 0} Kali x ${rp(payroll.potongan_telat || 0)}`, rp(potTelat)]);
  } else {
    pot.push(["Potongan Absensi", `Alpha ${row.alpha || 0} hari, Izin/Sakit ${row.izin || 0} hari, Telat ${row.telat || 0} kali`, row.potongan ? rp(row.potongan) : "-"]);
  }
  const lain = row.potongan_items || [];
  if (lain.length) lain.forEach((p) => pot.push(["Potongan Lain-lain", p.keterangan || "-", rp(p.jumlah)]));
  else pot.push(["Potongan Lain-lain", "", "-"]);
  const totPot = (row.potongan || 0) + (row.potongan_lain || 0);
  sectionTitle(doc, "RINCIAN POTONGAN", y);
  y = slipTable(doc, y + 3, "Komponen Potongan", pot, "TOTAL POTONGAN", rp(totPot)) + 9;

  const net = bruto - totPot;
  const words = doc.splitTextToSize(`( ${terbilang(net)} )`, W - 40);
  const boxH = 22 + words.length * 4.5;
  doc.setFillColor(226, 239, 218); doc.setDrawColor(112, 173, 71); doc.setLineWidth(0.4);
  doc.roundedRect(14, y, W - 28, boxH, 2, 2, "FD");
  doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(56, 87, 35);
  doc.text("TOTAL GAJI BERSIH (TAKE HOME PAY)", W / 2, y + 7, { align: "center" });
  doc.setFontSize(18); doc.text(rp(net), W / 2, y + 16, { align: "center" });
  doc.setFont("helvetica", "italic"); doc.setFontSize(9);
  doc.text(words, W / 2, y + 22, { align: "center" });
  y += boxH + 14;

  if (y > 240) { doc.addPage(); y = 24; }
  const tgl = new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(30, 30, 30);
  doc.text(`${payroll.kota ? payroll.kota + ", " : ""}${tgl}`, 14, y); y += 6;
  doc.text("Dibuat oleh,", 14, y); doc.text("Diterima oleh,", W - 60, y);
  y += 26;
  doc.setFont("helvetica", "bold");
  doc.text(`( ${payroll.penandatangan || info?.store_name || "Pemilik Toko"} )`, 14, y);
  doc.text(`( ${row.user_name} )`, W - 60, y); y += 5;
  doc.setFont("helvetica", "normal");
  doc.text("Owner", 14, y); doc.text("Karyawan", W - 60, y);
  doc.save(`Slip_Gaji_${row.user_name.replace(/\s+/g, "_")}_${monthLabel.replace(/\s+/g, "_")}.pdf`);
}


export function exportEcomTemplate() {
  const cols = ["Tanggal (YYYY-MM-DD)", "Channel", "SKU", "Qty", "Harga", "Biaya Admin", "Ongkir", "Biaya Lain"];
  const example = ["2026-10-08", "Shopee", "SKU-1001", 2, 155000, 5000, 10000, 0];
  const ws = XLSX.utils.aoa_to_sheet([cols, example]);
  ws["!cols"] = cols.map(() => ({ wch: 18 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Template");
  XLSX.writeFile(wb, "Template_Penjualan_Online.xlsx");
}

export async function readEcomExcel(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length === 0) continue;
    const sku = String(r[2] ?? "").trim();
    if (!sku) continue;
    const dateVal = r[0] instanceof Date ? r[0].toISOString().slice(0, 10) : (r[0] ? String(r[0]).slice(0, 10) : null);
    out.push({
      date: dateVal,
      channel: String(r[1] ?? "").trim(),
      sku,
      qty: Number(r[3]) || 0,
      harga: Number(r[4]) || 0,
      admin_fee: Number(r[5]) || 0,
      ongkir: Number(r[6]) || 0,
      biaya_lain: Number(r[7]) || 0,
    });
  }
  return out;
}

const PRODUCT_COLS = ["SKU", "Nama Produk", "Kategori", "Satuan", "Harga Beli", "Harga Normal", "Harga Reseller", "Stok", "Stok Minimal"];

export function exportProductTemplate(channels = []) {
  const cols = [...PRODUCT_COLS, ...channels.map((c) => `Harga ${c}`)];
  const example = ["PPK-001", "Pupuk Urea 50kg", "Pupuk", "zak", 280000, 310000, 300000, 20, 5, ...channels.map(() => 0)];
  const ws = XLSX.utils.aoa_to_sheet([cols, example]);
  ws["!cols"] = cols.map(() => ({ wch: 18 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Produk");
  XLSX.writeFile(wb, "Template_Produk.xlsx");
}

export async function readProductExcel(file) {
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, blankrows: false });
  const header = (rows[0] || []).map((h) => String(h ?? "").trim());
  const num = (v) => Number(String(v ?? "").replace(/[^\d.-]/g, "")) || 0;
  return rows.slice(1).map((r, i) => [r, i + 2]).filter(([r]) => r && (String(r[0] ?? "").trim() || String(r[1] ?? "").trim())).map(([r, row]) => ({
    row,
    sku: String(r[0] ?? "").trim(),
    name: String(r[1] ?? "").trim(),
    category: String(r[2] ?? "").trim() || "Lainnya",
    unit: String(r[3] ?? "").trim() || "pcs",
    harga_beli: num(r[4]),
    harga_jual: num(r[5]),
    harga_reseller: num(r[6]),
    stok: Math.round(num(r[7])),
    stok_minimal: r[8] === undefined || r[8] === "" ? 5 : Math.round(num(r[8])),
    harga_channel: Object.fromEntries(header.slice(9).map((h, i) => [h.replace(/^Harga\s+/i, ""), num(r[9 + i])]).filter(([k, v]) => k && v > 0)),
  }));
}

export async function printInstallmentReceipt(tx, idx, logoUrl, info = {}) {
  const pays = tx.payments || [];
  const pay = pays[idx];
  const paidUpTo = Math.max(0, (tx.amount_paid || 0) - pays.slice(idx + 1).reduce((s, p) => s + (p.amount || 0), 0));
  const doc = new jsPDF({ unit: "mm", format: [80, 130] });
  let y = 8;
  if (logoUrl) {
    try { doc.addImage(await loadImageData(logoUrl), "PNG", 30, y, 20, 20); y += 23; } catch (e) { /* abaikan */ }
  }
  doc.setFont("courier", "bold"); doc.setFontSize(12);
  doc.text((info.store_name || "TOKO TANI MAKMUR").toUpperCase(), 40, y, { align: "center" }); y += 5;
  doc.setFont("courier", "normal"); doc.setFontSize(7);
  if (info.address) { const l = doc.splitTextToSize(info.address, 68); doc.text(l, 40, y, { align: "center" }); y += 3.5 * l.length; }
  if (info.phone) { doc.text(`Telp: ${info.phone}`, 40, y, { align: "center" }); y += 4; }
  y += 2;
  doc.setFont("courier", "bold"); doc.setFontSize(10);
  doc.text("BUKTI PEMBAYARAN CICILAN", 40, y, { align: "center" }); y += 6;
  doc.setFont("courier", "normal"); doc.setFontSize(8);
  const row = (k, v, bold) => { doc.setFont("courier", bold ? "bold" : "normal"); doc.text(k, 5, y); doc.text(v, 75, y, { align: "right" }); y += 4.5; };
  row("No Invoice", tx.invoice_no);
  row("Tgl Transaksi", new Date(tx.created_at).toLocaleDateString("id-ID"));
  if (tx.customer_name) row("Pelanggan", tx.customer_name.slice(0, 22));
  doc.text("--------------------------------", 5, y); y += 4.5;
  row("Total Tagihan", rp(tx.total));
  row(`Cicilan ke-${idx + 1}`, rp(pay.amount), true);
  row("Tgl Bayar", new Date(pay.date).toLocaleDateString("id-ID"));
  row("Total Dibayar", rp(paidUpTo));
  const sisa = Math.max(0, tx.total - paidUpTo);
  row("Sisa Piutang", sisa > 0 ? rp(sisa) : "LUNAS", true);
  if (pay.by) row("Diterima oleh", pay.by);
  y += 3;
  doc.setFontSize(8);
  doc.text(sisa > 0 ? "Terima kasih atas pembayarannya." : "Terima kasih, tagihan telah LUNAS.", 40, y, { align: "center" });
  doc.save(`Cicilan_${tx.invoice_no}_ke-${idx + 1}.pdf`);
}

const BUNDLE_COLS = ["Nama Paket", "Kategori", "Harga Normal", "Harga Reseller", "SKU Komponen", "Qty"];

export function exportBundleTemplate(channels = []) {
  const cols = [...BUNDLE_COLS, ...channels.map((c) => `Harga ${c}`)];
  const ex = [
    ["Paket Tanam Cabai", "Paket", 60000, 55000, "BNH-001", 1, ...channels.map(() => 65000)],
    ["Paket Tanam Cabai", "", "", "", "PPK-002", 2, ...channels.map(() => "")],
  ];
  const ws = XLSX.utils.aoa_to_sheet([cols, ...ex]);
  ws["!cols"] = cols.map(() => ({ wch: 18 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Paket");
  XLSX.writeFile(wb, "Template_Paket_Bundling.xlsx");
}

export async function readBundleExcel(file) {
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, blankrows: false });
  const header = (rows[0] || []).map((h) => String(h ?? "").trim());
  const num = (v) => Number(String(v ?? "").replace(/[^\d.-]/g, "")) || 0;
  const map = new Map();
  let last = null;
  rows.slice(1).forEach((r, i) => {
    if (!r) return;
    const name = String(r[0] ?? "").trim();
    const sku = String(r[4] ?? "").trim();
    if (!name && !sku) return;
    const key = name ? name.toLowerCase() : last;
    if (!key) return;
    last = key;
    if (!map.has(key)) map.set(key, { name, category: "", harga_jual: 0, harga_reseller: 0, harga_channel: {}, components: [], rows: [] });
    const b = map.get(key);
    b.rows.push(i + 2);
    if (!b.category && String(r[1] ?? "").trim()) b.category = String(r[1]).trim();
    if (!b.harga_jual) b.harga_jual = num(r[2]);
    if (!b.harga_reseller) b.harga_reseller = num(r[3]);
    header.slice(6).forEach((h, j) => {
      const ch = h.replace(/^Harga\s+/i, ""); const v = num(r[6 + j]);
      if (ch && v > 0 && !b.harga_channel[ch]) b.harga_channel[ch] = v;
    });
    if (sku) b.components.push({ sku, qty: r[5] === undefined || r[5] === "" ? 1 : num(r[5]) });
  });
  return [...map.values()].map((b) => ({ ...b, category: b.category || "Paket" }));
}

export function printShelfLabels({ items }) {
  const doc = new jsPDF();
  // 4 cm x 2 cm labels: 5 x 14 = 70 per A4 page
  const W = 40, H = 20, cols = 5, perPage = 70, x0 = 5, y0 = 8.5;
  items.forEach((p, i) => {
    if (i > 0 && i % perPage === 0) doc.addPage();
    const k = i % perPage, x = x0 + (k % cols) * W, y = y0 + Math.floor(k / cols) * H;
    doc.setLineDashPattern([0.8, 0.8], 0); doc.setDrawColor(170, 170, 170); doc.rect(x, y, W, H);
    doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); doc.setTextColor(20, 20, 20);
    doc.text(doc.splitTextToSize(p.name, W - 3).slice(0, 2), x + 1.5, y + 3.3, { lineHeightFactor: 1.1 });
    doc.setFontSize(12); doc.setTextColor(27, 94, 59);
    doc.text(rp(p.harga_jual), x + 1.5, y + 14);
    doc.setFont("helvetica", "normal"); doc.setFontSize(5); doc.setTextColor(110, 110, 110);
    doc.text(`per ${p.unit || "pcs"}`, x + 1.5, y + 18.3);
    doc.text(p.sku || "", x + W - 1.5, y + 18.3, { align: "right" });
  });
  doc.save("Label_Harga_Rak.pdf");
}
