import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { exportPDF, exportExcel } from "@/lib/exporter";
import { Warehouse, FileDown, FileSpreadsheet, ChevronLeft, ChevronRight, Search, ChevronDown, ChevronUp } from "lucide-react";

const PER_PAGE = 10;

const Card = ({ label, value, testid, strong }) => (
  <div className={`rounded-xl p-4 border ${strong ? "bg-[#1B5E3B] border-[#1B5E3B] text-white" : "bg-secondary/40 border-slate-200"}`} data-testid={testid}>
    <p className={`text-[11px] font-semibold uppercase tracking-wider ${strong ? "text-emerald-100" : "text-muted-foreground"}`}>{label}</p>
    <p className="font-mono font-bold text-xl mt-1">{value}</p>
  </div>
);

export const InventoryValuePanel = ({ refreshKey }) => {
  const [data, setData] = useState(null);
  const [cat, setCat] = useState("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(() => localStorage.getItem("inv_panel_open") !== "0");
  const toggle = () => { localStorage.setItem("inv_panel_open", open ? "0" : "1"); setOpen(!open); };

  useEffect(() => { api.get("/inventory/value").then((r) => setData(r.data)); }, [refreshKey]);
  if (!data) return null;

  const { categories } = data;
  const items = [...data.items]
    .filter((i) => cat === "all" || i.category === cat)
    .filter((i) => !q.trim() || `${i.name} ${i.sku}`.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => a.category.localeCompare(b.category, "id") || a.name.localeCompare(b.name, "id"));
  const totalUnit = items.reduce((a, i) => a + i.stok, 0);
  const label = cat === "all" ? "Semua Kategori" : cat;
  const cols = ["SKU", "Produk", "Kategori", "Stok"];
  const rows = items.map((i) => [i.sku, i.name, i.category, `${i.stok} ${i.unit}`]);
  const footer = ["", "TOTAL", "", `${totalUnit}`];
  const pages = Math.max(1, Math.ceil(items.length / PER_PAGE));
  const cur = Math.min(page, pages);
  const shown = items.slice((cur - 1) * PER_PAGE, cur * PER_PAGE);
  const pickCat = (c) => { setCat(c); setPage(1); };
  const chip = (active) => `text-xs px-3 py-1.5 rounded-lg border transition-colors ${active ? "bg-[#1B5E3B] border-[#1B5E3B] text-white" : "bg-emerald-50 border-emerald-100 text-[#0F281E] hover:bg-emerald-100"}`;

  return (
    <div className="bg-card rounded-2xl border border-slate-200 p-6 space-y-5" data-testid="inventory-value-panel">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-heading font-semibold text-lg text-[#0F281E] flex items-center gap-2"><Warehouse className="w-5 h-5" /> Stok Barang</h3>
        <div className="flex gap-2">
          <button type="button" onClick={toggle} data-testid="inventory-collapse-toggle"
            className="flex items-center gap-1 px-3 py-2 rounded-xl border border-input text-sm hover:bg-secondary">
            {open ? <><ChevronUp className="w-4 h-4" /> Sembunyikan</> : <><ChevronDown className="w-4 h-4" /> Tampilkan</>}
          </button>
          <button onClick={() => exportPDF({ title: `Stok Barang - ${label}`, columns: cols, rows, foot: footer })} data-testid="inventory-export-pdf"
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-input text-sm hover:bg-secondary"><FileDown className="w-4 h-4" /> PDF</button>
          <button onClick={() => exportExcel({ filename: `Stok_Barang_${cat === "all" ? "Semua" : cat}`, sheetName: "Stok", columns: cols, rows: [...rows, footer] })} data-testid="inventory-export-excel"
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-input text-sm hover:bg-secondary"><FileSpreadsheet className="w-4 h-4" /> Excel</button>
        </div>
      </div>

      {open && <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card strong label={`Jumlah Barang · ${label}`} value={`${items.length} produk • ${totalUnit} unit`} testid="inventory-total-unit" />
      </div>

      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2" data-testid="inventory-categories">
          <button type="button" onClick={() => pickCat("all")} data-testid="inventory-category-all" className={chip(cat === "all")}>
            <b>Semua</b> · {data.items.length} produk
          </button>
          {[...categories].sort((a, b) => a.category.localeCompare(b.category, "id")).map((c) => (
            <button type="button" key={c.category} onClick={() => pickCat(c.category)} data-testid={`inventory-category-${c.category}`} className={chip(cat === c.category)}>
              <b>{c.category}</b> · {c.produk} produk
            </button>
          ))}
        </div>
      )}

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} data-testid="inventory-search-input" placeholder="Cari nama / SKU produk..."
          className="w-full pl-9 pr-3 py-2 rounded-xl border border-input text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5E3B]" />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-slate-200">
            <th className="py-2 pr-3">Produk</th><th className="py-2 pl-3 text-right">Stok</th>
          </tr></thead>
          <tbody>
            {items.length === 0 && <tr><td colSpan={2} className="py-6 text-center text-muted-foreground">Belum ada produk</td></tr>}
            {shown.map((i) => (
              <tr key={i.id} className="border-b border-slate-100" data-testid={`inventory-row-${i.id}`}>
                <td className="py-2 pr-3"><p className="font-medium">{i.name}</p><p className="text-xs text-muted-foreground">{i.category}</p></td>
                <td className="py-2 pl-3 text-right font-mono">{i.stok} {i.unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {items.length > PER_PAGE && (
        <div className="flex items-center justify-between text-sm" data-testid="inventory-pagination">
          <span className="text-muted-foreground" data-testid="inventory-page-info">{(cur - 1) * PER_PAGE + 1}–{Math.min(cur * PER_PAGE, items.length)} dari {items.length} produk</span>
          <div className="flex items-center gap-2">
            <button type="button" disabled={cur === 1} onClick={() => setPage(cur - 1)} data-testid="inventory-prev-page"
              className="p-2 rounded-lg border border-input hover:bg-secondary disabled:opacity-40"><ChevronLeft className="w-4 h-4" /></button>
            <span className="font-medium">Hal {cur} / {pages}</span>
            <button type="button" disabled={cur === pages} onClick={() => setPage(cur + 1)} data-testid="inventory-next-page"
              className="p-2 rounded-lg border border-input hover:bg-secondary disabled:opacity-40"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
      )}
      </>}
    </div>
  );
};
