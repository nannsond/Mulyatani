import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { rupiah, MONTHS } from "@/lib/format";
import { exportPDF, exportExcel } from "@/lib/exporter";
import { Scale, Loader2, FileDown, FileSpreadsheet, ArrowUp, ArrowDown, Minus, Wallet } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

const now = new Date();

export default function LabaRugi() {
  const [mode, setMode] = useState("bulanan");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState(null);
  const [yearData, setYearData] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [prev, setPrev] = useState(null);
  const [cash, setCash] = useState(null);
  const [cashScope, setCashScope] = useState("total");

  useEffect(() => {
    const period = cashScope === "period" ? (mode === "bulanan" ? `${year}-${String(month).padStart(2, "0")}` : `${year}`) : null;
    api.get(`/reports/cash${period ? `?period=${period}` : ""}`).then((r) => setCash(r.data));
  }, [cashScope, mode, year, month]);

  useEffect(() => {
    setData(null);
    const stmtUrl = mode === "bulanan" ? `/reports/monthly?year=${year}&month=${month}` : `/reports/yearly?year=${year}`;
    const expPrefix = mode === "bulanan" ? `${year}-${String(month).padStart(2, "0")}` : `${year}`;
    const pm = month === 1 ? 12 : month - 1;
    const py = month === 1 ? year - 1 : year;
    Promise.all([
      api.get(stmtUrl),
      api.get(`/reports/yearly?year=${year}`),
      api.get(`/expenses?month=${expPrefix}`),
      mode === "bulanan" ? api.get(`/reports/monthly?year=${py}&month=${pm}`) : Promise.resolve({ data: null }),
    ]).then(([st, yr, ex, pv]) => { setData(st.data); setYearData(yr.data); setExpenses(ex.data); setPrev(pv.data); });
  }, [mode, year, month]);

  const s = data?.summary;
  const omzet = s?.total_omzet || 0;
  const labaKotor = s?.total_laba || 0;
  const hpp = omzet - labaKotor;
  const pengeluaran = s?.total_pengeluaran || 0;
  const labaBersih = s?.laba_bersih ?? (labaKotor - pengeluaran);
  const periode = mode === "bulanan" ? `${MONTHS[month - 1]} ${year}` : `Tahun ${year}`;

  const catMap = {};
  expenses.forEach((e) => { catMap[e.category] = (catMap[e.category] || 0) + e.amount; });
  const cats = Object.entries(catMap).map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);

  const prevBersih = prev?.summary ? (prev.summary.laba_bersih ?? (prev.summary.total_laba - (prev.summary.total_pengeluaran || 0))) : null;
  const pct = (cur, pr) => (pr === null || pr === 0) ? null : ((cur - pr) / Math.abs(pr)) * 100;
  const change = prevBersih !== null ? pct(labaBersih, prevBersih) : null;

  const statementRows = [
    ["Pendapatan (Omzet)", omzet],
    ["Harga Pokok Penjualan (HPP)", -hpp],
    ["Laba Kotor", labaKotor],
    ["Pengeluaran Operasional", -pengeluaran],
    ["Laba Bersih", labaBersih],
  ];
  const exportRows = [...statementRows, ["", ""], ["RINCIAN PENGELUARAN", ""], ...cats.map((c) => [c.category, -c.amount])];

  const Line = ({ label, value, negative, bold, accent, testid }) => (
    <div className={`flex items-center justify-between py-3 ${bold ? "border-t-2 border-slate-300" : "border-t border-slate-100"}`} data-testid={testid}>
      <span className={`${bold ? "font-heading font-bold text-[#0F281E]" : "text-muted-foreground"} ${accent ? "text-lg" : "text-sm"}`}>{label}</span>
      <span className={`font-mono ${bold ? "font-bold" : ""} ${accent ? "text-xl" : "text-base"} ${negative ? "text-destructive" : accent ? "text-[#1B5E3B]" : "text-[#0F281E]"}`}>
        {negative ? "(" + rupiah(Math.abs(value)) + ")" : rupiah(value)}
      </span>
    </div>
  );

  const trend = (yearData?.monthly || []).map((m) => ({ label: MONTHS[m.month - 1].slice(0, 3), laba: m.laba_bersih ?? m.laba }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <div className="flex rounded-xl border border-input overflow-hidden">
            <button onClick={() => setMode("bulanan")} data-testid="lr-mode-bulanan" className={`px-4 py-2 text-sm font-semibold ${mode === "bulanan" ? "bg-[#1B5E3B] text-white" : "bg-card hover:bg-secondary"}`}>Bulanan</button>
            <button onClick={() => setMode("tahunan")} data-testid="lr-mode-tahunan" className={`px-4 py-2 text-sm font-semibold ${mode === "tahunan" ? "bg-[#1B5E3B] text-white" : "bg-card hover:bg-secondary"}`}>Tahunan</button>
          </div>
          {mode === "bulanan" && (
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))} data-testid="lr-month-select" className="px-3 py-2 rounded-xl border border-input text-sm bg-card">
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          )}
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} data-testid="lr-year-select" className="px-3 py-2 rounded-xl border border-input text-sm bg-card">
            {[0, 1, 2].map((d) => <option key={d} value={now.getFullYear() - d}>{now.getFullYear() - d}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          <button onClick={() => exportPDF({ title: "Laporan Laba Rugi", subtitle: periode, columns: ["Keterangan", "Jumlah"], rows: exportRows })} data-testid="export-pdf-button" className="flex items-center gap-2 px-3 py-2 rounded-xl border border-input text-sm hover:bg-secondary"><FileDown className="w-4 h-4" /> PDF</button>
          <button onClick={() => exportExcel({ filename: `Laba_Rugi_${periode.replace(/\s+/g, "_")}`, sheetName: "Laba Rugi", columns: ["Keterangan", "Jumlah"], rows: exportRows })} data-testid="export-excel-button" className="flex items-center gap-2 px-3 py-2 rounded-xl border border-input text-sm hover:bg-secondary"><FileSpreadsheet className="w-4 h-4" /> Excel</button>
        </div>
      </div>

      {!data ? <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-[#1B5E3B]" /></div> : (
        <>
        <div className="grid lg:grid-cols-2 gap-5">
          <div className="bg-card rounded-2xl border border-slate-200 p-6 sm:p-8" data-testid="laba-rugi-statement">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-11 h-11 rounded-xl bg-[#1B5E3B] flex items-center justify-center"><Scale className="w-6 h-6 text-white" /></div>
              <div>
                <h2 className="font-heading font-bold text-xl text-[#0F281E]">Laporan Laba Rugi</h2>
                <p className="text-sm text-muted-foreground">{periode}</p>
              </div>
            </div>
            <Line label="Pendapatan (Omzet)" value={omzet} testid="lr-omzet" />
            <Line label="Harga Pokok Penjualan (HPP)" value={hpp} negative testid="lr-hpp" />
            <Line label="Laba Kotor" value={labaKotor} bold testid="lr-laba-kotor" />
            <Line label="Pengeluaran Operasional" value={pengeluaran} negative testid="lr-pengeluaran" />
            <Line label="Laba Bersih" value={labaBersih} bold accent testid="lr-laba-bersih" />
            {mode === "bulanan" && change !== null && (
              <div className="mt-4 flex items-center gap-2 text-sm" data-testid="lr-comparison">
                <span className="text-muted-foreground">vs {MONTHS[(month === 1 ? 12 : month - 1) - 1]}:</span>
                <span className={`flex items-center gap-1 font-semibold ${change >= 0 ? "text-green-700" : "text-destructive"}`}>
                  {change >= 0 ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}{Math.abs(change).toFixed(1)}%
                </span>
                <span className="text-muted-foreground">({rupiah(prevBersih)})</span>
              </div>
            )}
            {mode === "bulanan" && change === null && prev && (
              <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground" data-testid="lr-comparison"><Minus className="w-4 h-4" /> Tidak ada data bulan sebelumnya</div>
            )}
          </div>

          <div className="space-y-5">
            <div className="bg-card rounded-2xl border border-slate-200 p-6" data-testid="lr-expense-breakdown">
              <h3 className="font-heading font-semibold text-lg mb-4">Rincian Pengeluaran per Kategori</h3>
              {cats.length === 0 ? <p className="text-sm text-muted-foreground">Tidak ada pengeluaran pada periode ini.</p> : (
                <div className="space-y-3">
                  {cats.map((c, i) => {
                    const maxV = cats[0].amount || 1;
                    return (
                      <div key={i} data-testid={`lr-cat-${c.category}`}>
                        <div className="flex justify-between text-sm mb-1"><span>{c.category}</span><span className="font-mono font-semibold text-destructive">{rupiah(c.amount)}</span></div>
                        <div className="h-2 rounded-full bg-secondary overflow-hidden"><div className="h-full bg-[#C85A32]" style={{ width: `${(c.amount / maxV) * 100}%` }} /></div>
                      </div>
                    );
                  })}
                  <div className="flex justify-between pt-2 border-t border-slate-200 text-sm font-semibold"><span>Total</span><span className="font-mono text-destructive">{rupiah(pengeluaran)}</span></div>
                </div>
              )}
            </div>

            <div className="bg-card rounded-2xl border border-slate-200 p-6">
              <h3 className="font-heading font-semibold text-lg mb-4">Tren Laba Bersih 12 Bulan ({year})</h3>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={trend}>
                  <defs>
                    <linearGradient id="lrg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#1B5E3B" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#1B5E3B" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${Math.round(v / 1000000)}jt`} />
                  <Tooltip formatter={(v) => rupiah(v)} />
                  <Area type="monotone" dataKey="laba" name="Laba Bersih" stroke="#1B5E3B" strokeWidth={2} fill="url(#lrg)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
        {cash && (
          <div className="bg-card rounded-2xl border border-slate-200 p-6 sm:p-8" data-testid="kas-card">
            <div className="flex items-start justify-between gap-3 mb-5">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-[#0F281E] flex items-center justify-center"><Wallet className="w-6 h-6 text-white" /></div>
                <div>
                  <h2 className="font-heading font-bold text-xl text-[#0F281E]">{cash.is_period ? `Arus Kas ${periode}` : "Kas Saat Ini (Uang Fisik)"}</h2>
                  <p className="text-sm text-muted-foreground">{cash.is_period ? "Pemasukan & pengeluaran kas pada periode terpilih" : "Akumulasi seluruh periode hingga sekarang"}</p>
                </div>
              </div>
              <div className="flex rounded-xl border border-input overflow-hidden shrink-0">
                <button onClick={() => setCashScope("total")} data-testid="kas-scope-total" className={`px-3 py-2 text-xs font-semibold ${cashScope === "total" ? "bg-[#1B5E3B] text-white" : "bg-card hover:bg-secondary"}`}>Total</button>
                <button onClick={() => setCashScope("period")} data-testid="kas-scope-period" className={`px-3 py-2 text-xs font-semibold ${cashScope === "period" ? "bg-[#1B5E3B] text-white" : "bg-card hover:bg-secondary"}`}>Periode Ini</button>
              </div>
            </div>
            {!cash.is_period && <Line label="Saldo Awal Kas" value={cash.saldo_awal_kas} testid="kas-saldo-awal" />}
            <Line label="Omzet Diterima (Kas)" value={cash.omzet} testid="kas-omzet" />
            <Line label="Pembelian Dibayar" value={cash.pembelian} negative testid="kas-pembelian" />
            <Line label="Pengeluaran" value={cash.pengeluaran} negative testid="kas-pengeluaran" />
            <Line label={cash.is_period ? "Arus Kas Bersih Periode" : "Kas Saat Ini"} value={cash.kas_saat_ini} bold accent testid="kas-total" />
            <p className="text-xs text-muted-foreground mt-3">{cash.is_period
              ? "Arus Kas = Omzet Diterima − Pembelian Dibayar − Pengeluaran pada periode ini (basis kas)."
              : "Kas = Saldo Awal + Omzet Diterima − Pembelian Dibayar − Pengeluaran. Hutang pembelian & piutang belum dihitung sampai benar-benar dibayar."}</p>
          </div>
        )}
        </>
      )}
    </div>
  );
}
