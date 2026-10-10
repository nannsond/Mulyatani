import { useEffect, useState } from "react";
import { api, apiError } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import { exportPDF, exportExcel } from "@/lib/exporter";
import { ClipboardCheck, FileDown, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { InventoryValuePanel } from "@/components/InventoryValuePanel";

const ALASAN = ["Penyesuaian", "Rusak", "Kadaluarsa", "Hilang", "Bonus Supplier", "Kesalahan Input"];

function badge(selisih) {
  if (selisih === 0) return { t: "Sesuai", c: "bg-green-100 text-green-700" };
  if (selisih < 0) return { t: `Kurang ${selisih}`, c: "bg-red-100 text-red-700" };
  return { t: `Lebih +${selisih}`, c: "bg-blue-100 text-blue-700" };
}

export default function StokOpname() {
  const { user } = useAuth();
  const [products, setProducts] = useState([]);
  const [history, setHistory] = useState([]);
  const [form, setForm] = useState({ product_id: "", stok_fisik: "", alasan: "Penyesuaian", note: "" });

  const load = () => {
    api.get("/products").then((r) => setProducts(r.data));
    api.get("/stok-opname").then((r) => setHistory(r.data));
  };
  useEffect(() => { load(); }, []);

  const selected = products.find((p) => p.id === form.product_id);
  const selisih = selected && form.stok_fisik !== "" ? Number(form.stok_fisik) - selected.stok : null;

  const submit = async (e) => {
    e.preventDefault();
    if (!form.product_id || form.stok_fisik === "") { toast.error("Lengkapi data"); return; }
    try {
      await api.post("/stok-opname", { product_id: form.product_id, stok_fisik: Number(form.stok_fisik), alasan: form.alasan, note: form.note });
      toast.success("Stok opname disesuaikan");
      setForm({ product_id: "", stok_fisik: "", alasan: "Penyesuaian", note: "" });
      load();
    } catch (err) { toast.error(apiError(err.response?.data?.detail)); }
  };

  const cols = ["Tanggal", "Produk", "Stok Sistem", "Stok Fisik", "Selisih", "Alasan", "Petugas"];
  const rows = history.map((h) => [fmtDateTime(h.created_at), h.product_name, h.stok_sistem, h.stok_fisik, h.selisih, h.alasan, h.user_name]);

  return (
    <div className="space-y-6">
    {user?.role === "admin" && <InventoryValuePanel refreshKey={history.length} />}
    <div className="grid lg:grid-cols-3 gap-6">
      <form onSubmit={submit} className="bg-card rounded-2xl border border-slate-200 p-6 h-fit space-y-4">
        <h3 className="font-heading font-semibold text-lg text-[#0F281E] flex items-center gap-2">
          <ClipboardCheck className="w-5 h-5" /> Input Opname
        </h3>
        <div>
          <label className="text-sm font-medium">Produk</label>
          <select value={form.product_id} onChange={(e) => setForm({ ...form, product_id: e.target.value })} data-testid="stok-opname-product-select"
            className="mt-1 w-full px-3 py-2.5 rounded-xl border border-input text-sm bg-white">
            <option value="">-- Pilih Produk --</option>
            {products.map((p) => <option key={p.id} value={p.id}>{`${p.name} (${p.sku})`}</option>)}
          </select>
        </div>
        {selected && (
          <div className="flex items-center justify-between p-3 rounded-xl bg-secondary/60 text-sm">
            <span>Stok Sistem</span>
            <span className="font-mono font-bold text-[#1B5E3B]" data-testid="stok-sistem-value">{selected.stok} {selected.unit}</span>
          </div>
        )}
        <div>
          <label className="text-sm font-medium">Stok Fisik (hasil hitung)</label>
          <input type="number" value={form.stok_fisik} onChange={(e) => setForm({ ...form, stok_fisik: e.target.value })} data-testid="stok-opname-physical-input"
            className="mt-1 w-full px-3 py-2.5 rounded-xl border border-input text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5E3B]" placeholder="0" />
        </div>
        {selisih !== null && (
          <div className="flex items-center justify-between p-3 rounded-xl border border-dashed text-sm">
            <span>Selisih</span>
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg ${badge(selisih).c}`} data-testid="stok-selisih-badge">{badge(selisih).t}</span>
          </div>
        )}
        <div>
          <label className="text-sm font-medium">Alasan</label>
          <select value={form.alasan} onChange={(e) => setForm({ ...form, alasan: e.target.value })} data-testid="stok-opname-alasan-select"
            className="mt-1 w-full px-3 py-2.5 rounded-xl border border-input text-sm bg-white">
            {ALASAN.map((a) => <option key={a}>{a}</option>)}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium">Catatan</label>
          <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} data-testid="stok-opname-note-input"
            className="mt-1 w-full px-3 py-2.5 rounded-xl border border-input text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5E3B]" placeholder="Opsional" />
        </div>
        <button type="submit" data-testid="stok-opname-save-button" className="w-full bg-[#1B5E3B] text-white py-3 rounded-xl font-semibold hover:bg-[#143D2B]">Simpan & Sesuaikan Stok</button>
      </form>

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
