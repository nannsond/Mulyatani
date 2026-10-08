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
