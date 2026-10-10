import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import { exportPDF, exportExcel } from "@/lib/exporter";
import { FileDown, FileSpreadsheet } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { InventoryValuePanel } from "@/components/InventoryValuePanel";
import { OpnameSessionForm } from "@/components/OpnameSessionForm";
import { OpnameHistory } from "@/components/OpnameHistory";

const monthKey = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const monthLabel = (key) => { const [y, m] = key.split("-"); return new Date(y, m - 1, 1).toLocaleDateString("id-ID", { month: "long", year: "numeric" }); };

export default function StokOpname() {
  const { user } = useAuth();
  const [products, setProducts] = useState([]);
  const [history, setHistory] = useState([]);
  const load = () => {
    api.get("/products").then((r) => setProducts(r.data));
    api.get("/stok-opname").then((r) => setHistory(r.data));
  };
  useEffect(() => { load(); }, []);

  const [month, setMonth] = useState(monthKey(new Date().toISOString()));
  const months = [...new Set([monthKey(new Date().toISOString()), ...history.map((h) => monthKey(h.created_at))])].sort().reverse();
  const filtered = month === "all" ? history : history.filter((h) => monthKey(h.created_at) === month);
  const periode = month === "all" ? "Semua Bulan" : monthLabel(month);

  const cols = ["Tanggal", "Produk", "Stok Sistem", "Stok Fisik", "Selisih", "Alasan", "Petugas"];
  const rows = filtered.map((h) => [fmtDateTime(h.created_at), h.product_name, h.stok_sistem, h.stok_fisik, h.selisih, h.alasan, h.user_name]);

  return (
    <div className="space-y-6">
    {user?.role === "admin" && <InventoryValuePanel refreshKey={history.length} />}
    <div className="grid lg:grid-cols-3 gap-6">
      <OpnameSessionForm products={products} onSaved={load} />

      <div className="lg:col-span-2 bg-card rounded-2xl border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h3 className="font-heading font-semibold text-lg text-[#0F281E]">Riwayat Stok Opname</h3>
          <div className="flex gap-2 flex-wrap">
            <select value={month} onChange={(e) => setMonth(e.target.value)} data-testid="opname-month-filter"
              className="px-3 py-2 rounded-xl border border-input text-sm bg-white">
              <option value="all">Semua Bulan</option>
              {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
            <button onClick={() => exportPDF({ title: `Riwayat Stok Opname - ${periode}`, columns: cols, rows })} data-testid="export-pdf-button"
              className="flex items-center gap-2 px-3 py-2 rounded-xl border border-input text-sm hover:bg-secondary"><FileDown className="w-4 h-4" /> PDF</button>
            <button onClick={() => exportExcel({ filename: `Stok_Opname_${month === "all" ? "Semua" : month}`, sheetName: "Opname", columns: cols, rows })} data-testid="export-excel-button"
              className="flex items-center gap-2 px-3 py-2 rounded-xl border border-input text-sm hover:bg-secondary"><FileSpreadsheet className="w-4 h-4" /> Excel</button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mb-3" data-testid="opname-month-summary">
          {periode}: {filtered.length} catatan · {filtered.filter((h) => h.selisih === 0).length} sesuai · {filtered.filter((h) => h.selisih < 0).length} kurang · {filtered.filter((h) => h.selisih > 0).length} lebih
        </p>
        <OpnameHistory history={filtered} isAdmin={user?.role === "admin"} onDeleted={load} />
      </div>
    </div>
    </div>
  );
}
