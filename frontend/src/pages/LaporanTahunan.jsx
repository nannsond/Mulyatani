import { useEffect, useState } from "react";
import { api, apiError } from "@/lib/api";
import { rupiah, MONTHS } from "@/lib/format";
import { exportPDF, exportExcel } from "@/lib/exporter";
import { useAuth } from "@/context/AuthContext";
import { ProductLaba, CategoryLaba } from "@/components/ProductLaba";
import { FileDown, FileSpreadsheet, Loader2, Wallet, Receipt, TrendingUp, Target } from "lucide-react";
import { toast } from "sonner";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

const now = new Date();

export default function LaporanTahunan() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [year, setYear] = useState(now.getFullYear());
  const [data, setData] = useState(null);
  const [targetInput, setTargetInput] = useState("");

  const load = () => {
    setData(null);
    api.get(`/reports/yearly?year=${year}`).then((r) => { setData(r.data); setTargetInput(String(r.data.target_omzet || "")); });
  };
  useEffect(() => { load(); }, [year]);

  const saveTarget = async () => {
    try {
      await api.post("/targets", { year, month: 0, target_omzet: Number(targetInput) || 0 });
      toast.success("Target tahunan disimpan");
      load();
    } catch (err) { toast.error(apiError(err.response?.data?.detail)); }
  };

  const cols = ["Bulan", "Jumlah Transaksi", "Omzet", "Laba Kotor"];
  const rows = data?.monthly.map((m) => [MONTHS[m.month - 1], m.transaksi, m.omzet, m.laba]) || [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} data-testid="filter-year-select"
          className="px-4 py-2.5 rounded-xl border border-input bg-card text-sm">
          {[0, 1, 2].map((d) => <option key={d} value={now.getFullYear() - d}>{now.getFullYear() - d}</option>)}
        </select>
        <div className="flex gap-2">
          <button onClick={() => exportPDF({ title: "Laporan Penjualan Tahunan", subtitle: `Tahun ${year}`, columns: cols, rows, foot: ["TOTAL", data?.summary.jumlah_transaksi || 0, data?.summary.total_omzet || 0, data?.summary.total_laba || 0] })} data-testid="export-pdf-button"
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-input text-sm hover:bg-secondary"><FileDown className="w-4 h-4" /> PDF</button>
          <button onClick={() => exportExcel({ filename: `Laporan_Tahunan_${year}`, sheetName: "Tahunan", columns: cols, rows })} data-testid="export-excel-button"
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-input text-sm hover:bg-secondary"><FileSpreadsheet className="w-4 h-4" /> Excel</button>
        </div>
      </div>

      {!data ? <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-[#1B5E3B]" /></div> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-card rounded-2xl border border-slate-200 p-5"><div className="flex items-center gap-2 text-muted-foreground mb-2"><Wallet className="w-4 h-4" /><span className="text-xs font-semibold uppercase tracking-wider">Total Omzet</span></div><p className="font-mono font-bold text-2xl text-[#0F281E]">{rupiah(data.summary.total_omzet)}</p></div>
            <div className="bg-card rounded-2xl border border-slate-200 p-5"><div className="flex items-center gap-2 text-muted-foreground mb-2"><Wallet className="w-4 h-4" /><span className="text-xs font-semibold uppercase tracking-wider">Laba Kotor</span></div><p className="font-mono font-bold text-2xl text-[#0F281E]">{rupiah(data.summary.total_laba)}</p></div>
            <div className="bg-card rounded-2xl border border-slate-200 p-5"><div className="flex items-center gap-2 text-muted-foreground mb-2"><Receipt className="w-4 h-4" /><span className="text-xs font-semibold uppercase tracking-wider">Transaksi</span></div><p className="font-mono font-bold text-2xl text-[#0F281E]">{data.summary.jumlah_transaksi}</p></div>
            <div className="bg-card rounded-2xl border border-slate-200 p-5"><div className="flex items-center gap-2 text-muted-foreground mb-2"><TrendingUp className="w-4 h-4" /><span className="text-xs font-semibold uppercase tracking-wider">Item Terjual</span></div><p className="font-mono font-bold text-2xl text-[#0F281E]">{data.summary.total_item}</p></div>
          </div>

          <div className="bg-card rounded-2xl border border-slate-200 p-6" data-testid="target-tahunan-panel">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
              <h3 className="font-heading font-semibold text-lg flex items-center gap-2"><Target className="w-5 h-5 text-[#C85A32]" /> Target Tahunan vs Pencapaian</h3>
              {isAdmin && (
                <div className="flex items-center gap-2">
                  <input type="number" value={targetInput} onChange={(e) => setTargetInput(e.target.value)} placeholder="Set target tahunan" data-testid="target-tahunan-input"
                    className="px-3 py-2 rounded-xl border border-input text-sm w-48 focus:outline-none focus:ring-2 focus:ring-[#1B5E3B]" />
                  <button onClick={saveTarget} data-testid="target-tahunan-save-button" className="px-4 py-2 rounded-xl bg-[#1B5E3B] text-white text-sm font-semibold hover:bg-[#143D2B]">Simpan</button>
                </div>
              )}
            </div>
            {data.target_omzet > 0 ? (() => {
              const pct = Math.min(100, (data.summary.total_omzet / data.target_omzet) * 100);
              const reached = data.summary.total_omzet >= data.target_omzet;
              return (
                <>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-muted-foreground">Pencapaian: <span className="font-mono font-semibold text-[#0F281E]">{rupiah(data.summary.total_omzet)}</span></span>
                    <span className="text-muted-foreground">Target: <span className="font-mono font-semibold text-[#0F281E]">{rupiah(data.target_omzet)}</span></span>
                  </div>
                  <div className="h-4 rounded-full bg-secondary overflow-hidden">
                    <div className={`h-full transition-all ${reached ? "bg-[#16A34A]" : "bg-[#C85A32]"}`} style={{ width: `${pct}%` }} data-testid="target-tahunan-progress-bar" />
                  </div>
                  <p className={`mt-2 text-sm font-semibold ${reached ? "text-green-700" : "text-[#C85A32]"}`} data-testid="target-tahunan-status">
                    {pct.toFixed(1)}% tercapai {reached ? "🎯 Target terlampaui!" : `• kurang ${rupiah(data.target_omzet - data.summary.total_omzet)}`}
                  </p>
                </>
              );
            })() : (
              <p className="text-sm text-muted-foreground">Belum ada target untuk tahun ini.{isAdmin ? " Masukkan target di atas." : ""}</p>
            )}
          </div>

          <div className="bg-card rounded-2xl border border-slate-200 p-6">
            <h3 className="font-heading font-semibold text-lg mb-4">Tren Penjualan {year} (Musim Tanam & Panen)</h3>
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={data.monthly.map((m) => ({ ...m, label: MONTHS[m.month - 1].slice(0, 3) }))}>
                <defs>
                  <linearGradient id="gy" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#C85A32" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#C85A32" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f0" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v / 1000000}jt`} />
                <Tooltip formatter={(v) => rupiah(v)} />
                <Area type="monotone" dataKey="omzet" stroke="#C85A32" strokeWidth={2} fill="url(#gy)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-card rounded-2xl border border-slate-200 p-6">
            <h3 className="font-heading font-semibold text-lg mb-4">Ringkasan Pencapaian 12 Bulan</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-secondary/50 text-left">
                    <th className="px-4 py-2.5 font-semibold">Bulan</th>
                    <th className="px-4 py-2.5 font-semibold text-center">Transaksi</th>
                    <th className="px-4 py-2.5 font-semibold text-right">Omzet</th>
                    <th className="px-4 py-2.5 font-semibold text-right">Laba Kotor</th>
                  </tr>
                </thead>
                <tbody>
                  {data.monthly.map((m) => (
                    <tr key={m.month} className="border-b border-slate-100 hover:bg-secondary/30" data-testid={`tahunan-month-${m.month}`}>
                      <td className="px-4 py-2.5 font-medium">{MONTHS[m.month - 1]}</td>
                      <td className="px-4 py-2.5 text-center font-mono">{m.transaksi}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{rupiah(m.omzet)}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-[#1B5E3B]">{rupiah(m.laba)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <ProductLaba data={data.product_laba} />

          <CategoryLaba data={data.category_laba} />

          <div className="grid lg:grid-cols-2 gap-6">
            <div className="bg-card rounded-2xl border border-slate-200 p-6">
              <h3 className="font-heading font-semibold text-lg mb-4">Produk Utama Tahun Ini</h3>
              <div className="space-y-3">
                {data.top_products.map((p, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-6 h-6 rounded-lg bg-secondary text-[#1B5E3B] text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                      <span className="text-sm truncate">{p.name}</span>
                    </div>
                    <span className="font-mono text-sm font-semibold text-[#1B5E3B]">{rupiah(p.omzet)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-card rounded-2xl border border-slate-200 p-6">
              <h3 className="font-heading font-semibold text-lg mb-4">Omzet per Kategori</h3>
              <div className="space-y-3">
                {data.categories.map((c, i) => {
                  const max = data.categories[0]?.omzet || 1;
                  return (
                    <div key={i}>
                      <div className="flex justify-between text-sm mb-1"><span>{c.category}</span><span className="font-mono font-semibold">{rupiah(c.omzet)}</span></div>
                      <div className="h-2 rounded-full bg-secondary overflow-hidden"><div className="h-full bg-[#1B5E3B]" style={{ width: `${(c.omzet / max) * 100}%` }} /></div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
