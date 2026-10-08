import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

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
  if (tx.discount && tx.discount > 0) {
    doc.setFont("courier", "normal"); doc.setFontSize(8);
    doc.text("Subtotal", 5, y); doc.text(rp(tx.subtotal || tx.total), 75, y, { align: "right" }); y += 4;
    doc.text("Diskon", 5, y); doc.text("-" + rp(tx.discount), 75, y, { align: "right" }); y += 4;
  }
  doc.setFont("courier", "bold");
  doc.setFontSize(10);
  doc.text("TOTAL", 5, y);
  doc.text(rp(tx.total), 75, y, { align: "right" }); y += lineH + 1;
  doc.setFont("courier", "normal");
  doc.setFontSize(8);
  doc.text(`Pembayaran: ${tx.payment_method}`, 5, y); y += lineH - 1;
  if (tx.customer_name) { doc.text(`Pelanggan: ${tx.customer_name}`, 5, y); y += 4; }
  if (tx.status && tx.status !== "lunas") {
    doc.text(`Dibayar: ${rp(tx.amount_paid || 0)}`, 5, y); y += 4;
    doc.text(`Sisa (Piutang): ${rp((tx.total || 0) - (tx.amount_paid || 0))}`, 5, y); y += 4;
  }
  y += 2;
  doc.text("Terima kasih atas kunjungan Anda!", 40, y, { align: "center" });
  doc.save(`Struk_${tx.invoice_no}.pdf`);
}

export async function printPriceList({ products, mode, logoUrl, info }) {
  const doc = new jsPDF();
  if (logoUrl) { try { const d = await loadImageData(logoUrl); doc.addImage(d, "PNG", 14, 8, 16, 16); } catch (e) { /* skip */ } }
  const x = logoUrl ? 34 : 14;
  doc.setFontSize(15); doc.setTextColor(27, 94, 59);
  doc.text(info?.store_name || "Toko Tani Makmur", x, 16);
  let hy = 22; doc.setFontSize(9); doc.setTextColor(90, 90, 90);
  if (info?.address) { doc.text(info.address, x, hy); hy += 5; }
  if (info?.phone) { doc.text("Telp: " + info.phone, x, hy); hy += 5; }
  doc.setFontSize(12); doc.setTextColor(20, 20, 20);
  const reseller = mode === "reseller";
  doc.text(reseller ? "DAFTAR HARGA RESELLER" : "DAFTAR HARGA NORMAL", 14, hy + 4);
  const cols = ["SKU", "Produk", "Kategori", "Satuan", "Harga"];
  const rows = products.map((p) => [p.sku, p.name, p.category, p.unit, rp(reseller ? (p.harga_reseller || p.harga_jual) : p.harga_jual)]);
  autoTable(doc, { startY: hy + 8, head: [cols], body: rows, headStyles: { fillColor: [27, 94, 59] }, styles: { fontSize: 8 } });
  doc.save(`Daftar_Harga_${mode}.pdf`);
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
