import { useEffect, useState } from "react";
import { api, apiError } from "@/lib/api";
import { rupiah, fmtDate, todayStr } from "@/lib/format";
import { exportPDF, exportExcel } from "@/lib/exporter";
import { Banknote, Plus, Trash2, FileDown, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";

const CATS = ["Gaji", "Listrik & Air", "Sewa", "Transport", "Operasional", "Perlengkapan", "Lainnya"];

export default function Pengeluaran() {
  const [items, setItems] = useState([]);
  const [month, setMonth] = useState(todayStr().slice(0, 7));
  const [form, setForm] = useState({ category: "Operasional", amount: "", note: "", date: todayStr() });

  const load = () => api.get(`/expenses?month=${month}`).then((r) => setItems(r.data));
  useEffect(() => { load(); }, [month]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.amount || Number(form.amount) <= 0) { toast.error("Masukkan jumlah"); return; }
    try {
      await api.post("/expenses", { category: form.category, amount: Number(form.amount), note: form.note, date: form.date });
      toast.success("Pengeluaran dicatat");
      setForm({ category: "Operasional", amount: "", note: "", date: todayStr() });
      load();
    } catch (err) { toast.error(apiError(err.response?.data?.detail)); }
  };

  const del = async (id) => {
    if (!window.confirm("Hapus pengeluaran ini?")) return;
    await api.delete(`/expenses/${id}`); toast.success("Dihapus"); load();
  };

  const total = items.reduce((s, x) => s + x.amount, 0);
  const cols = ["Tanggal", "Kategori", "Catatan", "Jumlah"];
  const rows = items.map((x) => [fmtDate(x.created_at), x.category, x.note, x.amount]);

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <form onSubmit={submit} className="bg-card rounded-2xl border border-slate-200 p-6 h-fit space-y-4">
        <h3 className="font-heading font-semibold text-lg flex items-center gap-2"><Banknote className="w-5 h-5 text-[#C85A32]" /> Catat Pengeluaran</h3>
        <div>
          <label className="text-sm font-medium">Kategori</label>
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} data-testid="expense-category-select"
            className="mt-1 w-full px-3 py-2.5 rounded-xl border border-input text-sm bg-white">
            {CATS.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium">Jumlah (Rp)</label>
          <input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} data-testid="expense-amount-input"
            className="mt-1 w-full px-3 py-2.5 rounded-xl border border-input text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5E3B]" placeholder="0" />
        </div>
        <div>
          <label className="text-sm font-medium">Tanggal</label>
          <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} data-testid="expense-date-input"
            className="mt-1 w-full px-3 py-2.5 rounded-xl border border-input text-sm" />
        </div>
        <div>
          <label className="text-sm font-medium">Catatan</label>
          <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} data-testid="expense-note-input"
            className="mt-1 w-full px-3 py-2.5 rounded-xl border border-input text-sm" placeholder="Opsional" />
        </div>
        <button type="submit" data-testid="expense-save-button" className="w-full bg-[#1B5E3B] text-white py-3 rounded-xl font-semibold hover:bg-[#143D2B] flex items-center justify-center gap-2"><Plus className="w-4 h-4" /> Simpan</button>
      </form>

      <div className="lg:col-span-2 bg-card rounded-2xl border border-slate-200 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h3 className="font-heading font-semibold text-lg">Laporan Pengeluaran</h3>
          <div className="flex gap-2">
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} data-testid="expense-month-filter" className="px-3 py-2 rounded-xl border border-input text-sm" />
            <button onClick={() => exportPDF({ title: "Laporan Pengeluaran", subtitle: month, columns: cols, rows, foot: ["", "", "TOTAL", total] })} data-testid="export-pdf-button" className="flex items-center gap-2 px-3 py-2 rounded-xl border border-input text-sm hover:bg-secondary"><FileDown className="w-4 h-4" /> PDF</button>
            <button onClick={() => exportExcel({ filename: `Pengeluaran_${month}`, sheetName: "Pengeluaran", columns: cols, rows })} data-testid="export-excel-button" className="flex items-center gap-2 px-3 py-2 rounded-xl border border-input text-sm hover:bg-secondary"><FileSpreadsheet className="w-4 h-4" /> Excel</button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mb-3">Total pengeluaran bulan ini: <span className="font-mono font-bold text-destructive">{rupiah(total)}</span></p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-200 bg-secondary/50 text-left">
              <th className="px-4 py-2.5 font-semibold">Tanggal</th><th className="px-4 py-2.5 font-semibold">Kategori</th><th className="px-4 py-2.5 font-semibold">Catatan</th><th className="px-4 py-2.5 font-semibold text-right">Jumlah</th><th className="px-4 py-2.5 font-semibold text-center">Aksi</th>
            </tr></thead>
            <tbody>
              {items.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Belum ada pengeluaran.</td></tr>}
              {items.map((x) => (
                <tr key={x.id} className="border-b border-slate-100" data-testid={`expense-row-${x.id}`}>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{fmtDate(x.created_at)}</td>
                  <td className="px-4 py-2.5"><span className="text-xs px-2 py-1 rounded-lg bg-secondary">{x.category}</span></td>
                  <td className="px-4 py-2.5">{x.note}</td>
                  <td className="px-4 py-2.5 text-right font-mono font-semibold text-destructive">{rupiah(x.amount)}</td>
                  <td className="px-4 py-2.5 text-center"><button onClick={() => del(x.id)} data-testid={`expense-delete-${x.id}`} className="text-destructive"><Trash2 className="w-4 h-4" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
