import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { rupiah, MONTHS } from "@/lib/format";
import { exportPDF, exportExcel } from "@/lib/exporter";
import { FileDown, FileSpreadsheet, Loader2, Wallet, Receipt, TrendingUp } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

const now = new Date();

export default function LaporanTahunan() {
  const [year, setYear] = useState(now.getFullYear());
  const [data, setData] = useState(null);

  useEffect(() => {
    setData(null);
    api.get(`/reports/yearly?year=${year}`).then((r) => setData(r.data));
  }, [year]);

  const cols = ["Bulan", "Jumlah Transaksi", "Omzet"];
  const rows = data?.monthly.map((m) => [MONTHS[m.month - 1], m.transaksi, m.omzet]) || [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} data-testid="filter-year-select"
          className="px-4 py-2.5 rounded-xl border border-input bg-card text-sm">
          {[0, 1, 2].map((d) => <option key={d} value={now.getFullYear() - d}>{now.getFullYear() - d}</option>)}
        </select>
        <div className="flex gap-2">
          <button onClick={() => exportPDF({ title: "Laporan Penjualan Tahunan", subtitle: `Tahun ${year}`, columns: cols, rows, foot: ["TOTAL", data?.summary.jumlah_transaksi || 0, data?.summary.total_omzet || 0] })} data-testid="export-pdf-button"
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-input text-sm hover:bg-secondary"><FileDown className="w-4 h-4" /> PDF</button>
          <button onClick={() => exportExcel({ filename: `Laporan_Tahunan_${year}`, sheetName: "Tahunan", columns: cols, rows })} data-testid="export-excel-button"
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-input text-sm hover:bg-secondary"><FileSpreadsheet className="w-4 h-4" /> Excel</button>
        </div>
      </div>

      {!data ? <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-[#1B5E3B]" /></div> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-card rounded-2xl border border-slate-200 p-5"><div className="flex items-center gap-2 text-muted-foreground mb-2"><Wallet className="w-4 h-4" /><span className="text-xs font-semibold uppercase tracking-wider">Total Omzet</span></div><p className="font-mono font-bold text-2xl text-[#0F281E]">{rupiah(data.summary.total_omzet)}</p></div>
            <div className="bg-card rounded-2xl border border-slate-200 p-5"><div className="flex items-center gap-2 text-muted-foreground mb-2"><Receipt className="w-4 h-4" /><span className="text-xs font-semibold uppercase tracking-wider">Transaksi</span></div><p className="font-mono font-bold text-2xl text-[#0F281E]">{data.summary.jumlah_transaksi}</p></div>
            <div className="bg-card rounded-2xl border border-slate-200 p-5"><div className="flex items-center gap-2 text-muted-foreground mb-2"><TrendingUp className="w-4 h-4" /><span className="text-xs font-semibold uppercase tracking-wider">Item Terjual</span></div><p className="font-mono font-bold text-2xl text-[#0F281E]">{data.summary.total_item}</p></div>
            <div className="bg-card rounded-2xl border border-slate-200 p-5"><div className="flex items-center gap-2 text-muted-foreground mb-2"><span className="text-xs font-semibold uppercase tracking-wider">Laba Kotor</span></div><p className="font-mono font-bold text-2xl text-[#0F281E]">{rupiah(data.summary.total_laba)}</p></div>
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
