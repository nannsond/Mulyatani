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
  const height = 115 + itemsCount * 8;
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
  doc.setFont("courier", "bold");
  doc.setFontSize(10);
  doc.text("TOTAL", 5, y);
  doc.text(rp(tx.total), 75, y, { align: "right" }); y += lineH + 1;
  doc.setFont("courier", "normal");
  doc.setFontSize(8);
  doc.text(`Pembayaran: ${tx.payment_method}`, 5, y); y += lineH + 2;
  doc.setFontSize(8);
  doc.text("Terima kasih atas kunjungan Anda!", 40, y, { align: "center" });
  doc.save(`Struk_${tx.invoice_no}.pdf`);
}
