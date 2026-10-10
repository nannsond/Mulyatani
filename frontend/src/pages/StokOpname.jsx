import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import { exportPDF, exportExcel } from "@/lib/exporter";
import { FileDown, FileSpreadsheet } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { InventoryValuePanel } from "@/components/InventoryValuePanel";
import { OpnameSessionForm } from "@/components/OpnameSessionForm";
import { OpnameHistory, groupSessions } from "@/components/OpnameHistory";

export default function StokOpname() {
  const { user } = useAuth();
  const [products, setProducts] = useState([]);
  const [history, setHistory] = useState([]);
  const load = () => {
    api.get("/products").then((r) => setProducts(r.data));
    api.get("/stok-opname").then((r) => setHistory(r.data));
  };
  useEffect(() => { load(); }, []);

  const cols = ["Sesi", "Tanggal", "Produk", "Stok Sistem", "Stok Fisik", "Selisih", "Alasan", "Petugas"];
  const sessions = groupSessions(history);
  const rows = sessions.flatMap((s, i) => [
    ...s.items.map((h) => [`#${sessions.length - i}`, fmtDateTime(h.created_at), h.product_name, h.stok_sistem, h.stok_fisik, h.selisih, h.alasan, h.user_name]),
    [`#${sessions.length - i}`, "", `TOTAL: ${s.items.length} produk`, "", "", `-${s.kurang} / +${s.lebih}`, `${s.nSesuai} sesuai`, ""],
  ]);

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
        <OpnameHistory history={history} isAdmin={user?.role === "admin"} onDeleted={load} />
      </div>
    </div>
    </div>
  );
}
