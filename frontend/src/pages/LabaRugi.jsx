import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { rupiah, MONTHS } from "@/lib/format";
import { exportPDF, exportExcel } from "@/lib/exporter";
import { Scale, Loader2, FileDown, FileSpreadsheet } from "lucide-react";

const now = new Date();

export default function LabaRugi() {
  const [mode, setMode] = useState("bulanan");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState(null);

  useEffect(() => {
    setData(null);
    const url = mode === "bulanan" ? `/reports/monthly?year=${year}&month=${month}` : `/reports/yearly?year=${year}`;
    api.get(url).then((r) => setData(r.data));
  }, [mode, year, month]);

  const s = data?.summary;
  const omzet = s?.total_omzet || 0;
  const labaKotor = s?.total_laba || 0;
  const hpp = omzet - labaKotor;
  const pengeluaran = s?.total_pengeluaran || 0;
  const labaBersih = s?.laba_bersih ?? (labaKotor - pengeluaran);
  const periode = mode === "bulanan" ? `${MONTHS[month - 1]} ${year}` : `Tahun ${year}`;

  const rows = [
    ["Pendapatan (Omzet)", omzet],
    ["Harga Pokok Penjualan (HPP)", -hpp],
    ["Laba Kotor", labaKotor],
    ["Pengeluaran Operasional", -pengeluaran],
    ["Laba Bersih", labaBersih],
  ];

  const Line = ({ label, value, negative, bold, accent, testid }) => (
    <div className={`flex items-center justify-between py-3 ${bold ? "border-t-2 border-slate-300" : "border-t border-slate-100"}`} data-testid={testid}>
      <span className={`${bold ? "font-heading font-bold text-[#0F281E]" : "text-muted-foreground"} ${accent ? "text-lg" : "text-sm"}`}>{label}</span>
      <span className={`font-mono ${bold ? "font-bold" : ""} ${accent ? "text-xl" : "text-base"} ${negative ? "text-destructive" : accent ? "text-[#1B5E3B]" : "text-[#0F281E]"}`}>
        {negative ? "(" + rupiah(Math.abs(value)) + ")" : rupiah(value)}
      </span>
    </div>
  );

  return (
    <div className="max-w-2xl space-y-5">
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
          <button onClick={() => exportPDF({ title: "Laporan Laba Rugi", subtitle: periode, columns: ["Keterangan", "Jumlah"], rows: rows.map((r) => [r[0], r[1]]) })} data-testid="export-pdf-button" className="flex items-center gap-2 px-3 py-2 rounded-xl border border-input text-sm hover:bg-secondary"><FileDown className="w-4 h-4" /> PDF</button>
          <button onClick={() => exportExcel({ filename: `Laba_Rugi_${periode.replace(/\s+/g, "_")}`, sheetName: "Laba Rugi", columns: ["Keterangan", "Jumlah"], rows: rows.map((r) => [r[0], r[1]]) })} data-testid="export-excel-button" className="flex items-center gap-2 px-3 py-2 rounded-xl border border-input text-sm hover:bg-secondary"><FileSpreadsheet className="w-4 h-4" /> Excel</button>
        </div>
      </div>

      {!data ? <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-[#1B5E3B]" /></div> : (
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
          <p className="mt-6 text-xs text-muted-foreground">HPP dihitung dari harga beli produk yang terjual. Laba Bersih = Laba Kotor − Pengeluaran.</p>
        </div>
      )}
    </div>
  );
}
