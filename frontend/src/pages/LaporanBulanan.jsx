import { useEffect, useState } from "react";
import { api, apiError } from "@/lib/api";
import { rupiah, MONTHS } from "@/lib/format";
import { exportPDF, exportExcel } from "@/lib/exporter";
import { ProductLaba, CategoryLaba } from "@/components/ProductLaba";
import { useAuth } from "@/context/AuthContext";
import { FileDown, FileSpreadsheet, Loader2, Wallet, Receipt, Target } from "lucide-react";
import { toast } from "sonner";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, Legend } from "recharts";

const COLORS = ["#1B5E3B", "#C85A32", "#D97706", "#2D8A56", "#0284C7"];
const now = new Date();

export default function LaporanBulanan() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState(null);
  const [targetInput, setTargetInput] = useState("");

  const load = () => {
    setData(null);
    api.get(`/reports/monthly?year=${year}&month=${month}`).then((r) => { setData(r.data); setTargetInput(String(r.data.target_omzet || "")); });
  };
  useEffect(() => { load(); }, [year, month]);

  const saveTarget = async () => {
    try {
      await api.post("/targets", { year, month, target_omzet: Number(targetInput) || 0 });
      toast.success("Target disimpan");
      load();
    } catch (err) { toast.error(apiError(err.response?.data?.detail)); }
  };

  const cols = ["Tanggal", "Jumlah Transaksi", "Omzet"];
  const rows = data?.daily.map((d) => [d.date, d.transaksi, d.omzet]) || [];
  const sub = `${MONTHS[month - 1]} ${year}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))} data-testid="filter-month-select"
            className="px-4 py-2.5 rounded-xl border border-input bg-card text-sm">
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} data-testid="filter-year-select"
            className="px-4 py-2.5 rounded-xl border border-input bg-card text-sm">
            {[0, 1, 2].map((d) => <option key={d} value={now.getFullYear() - d}>{now.getFullYear() - d}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          <button onClick={() => exportPDF({ title: "Laporan Penjualan Bulanan", subtitle: sub, columns: cols, rows, foot: ["", "TOTAL", data?.summary.total_omzet || 0] })} data-testid="export-pdf-button"
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-input text-sm hover:bg-secondary"><FileDown className="w-4 h-4" /> PDF</button>
          <button onClick={() => exportExcel({ filename: `Laporan_Bulanan_${sub.replace(" ", "_")}`, sheetName: "Bulanan", columns: cols, rows })} data-testid="export-excel-button"
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-input text-sm hover:bg-secondary"><FileSpreadsheet className="w-4 h-4" /> Excel</button>
        </div>
      </div>

      {!data ? <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-[#1B5E3B]" /></div> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-card rounded-2xl border border-slate-200 p-5"><div className="flex items-center gap-2 text-muted-foreground mb-2"><Wallet className="w-4 h-4" /><span className="text-xs font-semibold uppercase tracking-wider">Total Omzet</span></div><p className="font-mono font-bold text-2xl text-[#0F281E]">{rupiah(data.summary.total_omzet)}</p></div>
            <div className="bg-card rounded-2xl border border-slate-200 p-5"><div className="flex items-center gap-2 text-muted-foreground mb-2"><Wallet className="w-4 h-4" /><span className="text-xs font-semibold uppercase tracking-wider">Laba Kotor</span></div><p className="font-mono font-bold text-2xl text-[#0F281E]">{rupiah(data.summary.total_laba)}</p></div>
            <div className="bg-card rounded-2xl border border-slate-200 p-5"><div className="flex items-center gap-2 text-muted-foreground mb-2"><Receipt className="w-4 h-4" /><span className="text-xs font-semibold uppercase tracking-wider">Transaksi</span></div><p className="font-mono font-bold text-2xl text-[#0F281E]">{data.summary.jumlah_transaksi}</p></div>
            <div className="bg-card rounded-2xl border border-slate-200 p-5"><div className="flex items-center gap-2 text-muted-foreground mb-2"><span className="text-xs font-semibold uppercase tracking-wider">Item Terjual</span></div><p className="font-mono font-bold text-2xl text-[#0F281E]">{data.summary.total_item}</p></div>
            <div className="bg-card rounded-2xl border border-slate-200 p-5"><div className="flex items-center gap-2 text-muted-foreground mb-2"><span className="text-xs font-semibold uppercase tracking-wider">Rata-rata/Tx</span></div><p className="font-mono font-bold text-2xl text-[#0F281E]">{rupiah(data.summary.rata_rata)}</p></div>
          </div>

          <div className="bg-card rounded-2xl border border-slate-200 p-6" data-testid="target-panel">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
              <h3 className="font-heading font-semibold text-lg flex items-center gap-2"><Target className="w-5 h-5 text-[#C85A32]" /> Target vs Pencapaian</h3>
              {isAdmin && (
                <div className="flex items-center gap-2">
                  <input type="number" value={targetInput} onChange={(e) => setTargetInput(e.target.value)} placeholder="Set target omzet" data-testid="target-input"
                    className="px-3 py-2 rounded-xl border border-input text-sm w-44 focus:outline-none focus:ring-2 focus:ring-[#1B5E3B]" />
                  <button onClick={saveTarget} data-testid="target-save-button" className="px-4 py-2 rounded-xl bg-[#1B5E3B] text-white text-sm font-semibold hover:bg-[#143D2B]">Simpan</button>
                </div>
              )}
            </div>
            {data.target_omzet > 0 ? (
              <>
                {(() => {
                  const pct = Math.min(100, (data.summary.total_omzet / data.target_omzet) * 100);
                  const reached = data.summary.total_omzet >= data.target_omzet;
                  return (
                    <>
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-muted-foreground">Pencapaian: <span className="font-mono font-semibold text-[#0F281E]">{rupiah(data.summary.total_omzet)}</span></span>
                        <span className="text-muted-foreground">Target: <span className="font-mono font-semibold text-[#0F281E]">{rupiah(data.target_omzet)}</span></span>
                      </div>
                      <div className="h-4 rounded-full bg-secondary overflow-hidden">
                        <div className={`h-full transition-all ${reached ? "bg-[#16A34A]" : "bg-[#C85A32]"}`} style={{ width: `${pct}%` }} data-testid="target-progress-bar" />
                      </div>
                      <p className={`mt-2 text-sm font-semibold ${reached ? "text-green-700" : "text-[#C85A32]"}`} data-testid="target-status">
                        {pct.toFixed(1)}% tercapai {reached ? "🎯 Target terlampaui!" : `• kurang ${rupiah(data.target_omzet - data.summary.total_omzet)}`}
                      </p>
                    </>
                  );
                })()}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Belum ada target untuk bulan ini.{isAdmin ? " Masukkan target di atas." : ""}</p>
            )}
          </div>

          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-card rounded-2xl border border-slate-200 p-6">
              <h3 className="font-heading font-semibold text-lg mb-4">Omzet Harian - {sub}</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data.daily.map((d) => ({ ...d, label: d.date.slice(8) }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v / 1000}k`} />
                  <Tooltip formatter={(v) => rupiah(v)} />
                  <Bar dataKey="omzet" fill="#1B5E3B" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-card rounded-2xl border border-slate-200 p-6">
              <h3 className="font-heading font-semibold text-lg mb-4">Per Kategori</h3>
              {data.categories.length === 0 ? <p className="text-sm text-muted-foreground">Belum ada data.</p> : (
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={data.categories} dataKey="omzet" nameKey="category" cx="50%" cy="50%" outerRadius={80}>
                      {data.categories.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v) => rupiah(v)} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <ProductLaba data={data.product_laba} />

          <CategoryLaba data={data.category_laba} />

          <div className="bg-card rounded-2xl border border-slate-200 p-6">
            <h3 className="font-heading font-semibold text-lg mb-4">Produk Terlaris</h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {data.top_products.map((p, i) => (
                <div key={i} className="p-3 rounded-xl bg-secondary/50">
                  <p className="text-sm font-medium line-clamp-2 min-h-[2.5rem]">{p.name}</p>
                  <p className="font-mono font-bold text-[#1B5E3B] mt-1">{rupiah(p.omzet)}</p>
                  <p className="text-xs text-muted-foreground">{p.qty} terjual</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
