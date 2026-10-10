import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import { exportPDF, exportExcel } from "@/lib/exporter";
import { FileDown, FileSpreadsheet } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { InventoryValuePanel } from "@/components/InventoryValuePanel";
import { OpnameSessionForm, badge } from "@/components/OpnameSessionForm";

export default function StokOpname() {
  const { user } = useAuth();
  const [products, setProducts] = useState([]);
  const [history, setHistory] = useState([]);
  const load = () => {
    api.get("/products").then((r) => setProducts(r.data));
    api.get("/stok-opname").then((r) => setHistory(r.data));
  };
  useEffect(() => { load(); }, []);

  const cols = ["Tanggal", "Produk", "Stok Sistem", "Stok Fisik", "Selisih", "Alasan", "Petugas"];
  const rows = history.map((h) => [fmtDateTime(h.created_at), h.product_name, h.stok_sistem, h.stok_fisik, h.selisih, h.alasan, h.user_name]);

  return (
    <div className="space-y-6">
    {user?.role === "admin" && <InventoryValuePanel refreshKey={history.length} />}
    <div className="grid lg:grid-cols-3 gap-6">
      <OpnameSessionForm products={products} onSaved={load} />

      <div className="lg:col-span-2 bg-card rounded-2xl border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h3 className="font-heading font-semibold text-lg text-[#0F281E]">Riwayat Stok Opname</h3>
          <div className="flex gap-2">
            <button onClick={() => exportPDF({ title: "Riwayat Stok Opname", columns: cols, rows })} data-testid="export-pdf-button"
              className="flex items-center gap-2 px-3 py-2 rounded-xl border border-input text-sm hover:bg-secondary"><FileDown className="w-4 h-4" /> PDF</button>
            <button onClick={() => exportExcel({ filename: "Stok_Opname", sheetName: "Opname", columns: cols, rows })} data-testid="export-excel-button"
              className="flex items-center gap-2 px-3 py-2 rounded-xl border border-input text-sm hover:bg-secondary"><FileSpreadsheet className="w-4 h-4" /> Excel</button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-secondary/50 text-left">
                <th className="px-3 py-2.5 font-semibold">Tanggal</th>
                <th className="px-3 py-2.5 font-semibold">Produk</th>
                <th className="px-3 py-2.5 font-semibold text-center">Sistem</th>
                <th className="px-3 py-2.5 font-semibold text-center">Fisik</th>
                <th className="px-3 py-2.5 font-semibold text-center">Status</th>
                <th className="px-3 py-2.5 font-semibold">Alasan</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">Belum ada riwayat.</td></tr>}
              {history.map((h) => (
                <tr key={h.id} className="border-b border-slate-100" data-testid={`opname-row-${h.id}`}>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">{fmtDateTime(h.created_at)}</td>
                  <td className="px-3 py-2.5 font-medium">{h.product_name}</td>
                  <td className="px-3 py-2.5 text-center font-mono">{h.stok_sistem}</td>
                  <td className="px-3 py-2.5 text-center font-mono">{h.stok_fisik}</td>
                  <td className="px-3 py-2.5 text-center"><span className={`text-xs font-semibold px-2 py-1 rounded-lg ${badge(h.selisih).c}`}>{badge(h.selisih).t}</span></td>
                  <td className="px-3 py-2.5 text-xs">{h.alasan}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
    </div>
  );
}
