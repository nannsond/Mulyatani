import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { rupiah, fmtDate } from "@/lib/format";
import { exportPDF, exportExcel } from "@/lib/exporter";
import { CalendarDays, FileDown, FileSpreadsheet } from "lucide-react";

const COLS = ["Tanggal", "Toko Fisik", "Online (Cair)", "Pinjaman", "Pembelian", "Pengeluaran", "Bersih", "Saldo Berjalan"];
const KEYS = ["toko", "online", "pinjaman", "pembelian", "pengeluaran", "bersih", "saldo_berjalan"];
const OUT = new Set(["pembelian", "pengeluaran"]);

const Cell = ({ k, v }) => {
  const cls = OUT.has(k) ? "text-destructive" : k === "bersih" || k === "saldo_berjalan" ? (v < 0 ? "text-destructive font-semibold" : "text-[#1B5E3B] font-semibold") : "";
  return <td className={`px-3 py-2 text-right font-mono whitespace-nowrap ${cls}`}>{v ? (OUT.has(k) ? `(${rupiah(v)})` : rupiah(v)) : "-"}</td>;
};

export const CashDailyTable = ({ period, label }) => {
  const [rows, setRows] = useState([]);
  useEffect(() => { api.get(`/reports/cash/daily?period=${period}`).then((r) => setRows(r.data.rows)); }, [period]);

  const total = KEYS.reduce((o, k) => ({ ...o, [k]: k === "saldo_berjalan" ? (rows.at(-1)?.saldo_berjalan || 0) : rows.reduce((s, r) => s + r[k], 0) }), {});
  const data = rows.map((r) => [fmtDate(r.date), ...KEYS.map((k) => (OUT.has(k) ? -r[k] : r[k]))]);
  const foot = ["TOTAL", ...KEYS.map((k) => (OUT.has(k) ? -total[k] : total[k]))];

  return (
    <div className="bg-card rounded-2xl border border-slate-200 p-6 sm:p-8" data-testid="cash-daily-card">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="font-heading font-bold text-xl text-[#0F281E] flex items-center gap-2"><CalendarDays className="w-5 h-5 text-[#C85A32]" /> Rincian Arus Kas Harian</h2>
          <p className="text-sm text-muted-foreground">Uang masuk & keluar per hari – {label}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => exportPDF({ title: "Rincian Arus Kas Harian", subtitle: label, columns: COLS, rows: data, foot })} data-testid="cash-daily-export-pdf" className="flex items-center gap-2 px-3 py-2 rounded-xl border border-input text-sm hover:bg-secondary"><FileDown className="w-4 h-4" /> PDF</button>
          <button onClick={() => exportExcel({ filename: `ArusKas_${period}`, sheetName: "Arus Kas", columns: COLS, rows: [...data, foot] })} data-testid="cash-daily-export-excel" className="flex items-center gap-2 px-3 py-2 rounded-xl border border-input text-sm hover:bg-secondary"><FileSpreadsheet className="w-4 h-4" /> Excel</button>
        </div>
      </div>
      <div className="overflow-x-auto max-h-[480px] overflow-y-auto rounded-xl border border-slate-100">
        <table className="w-full text-sm" data-testid="cash-daily-table">
          <thead className="sticky top-0 bg-secondary"><tr className="text-left">
            {COLS.map((c, i) => <th key={c} className={`px-3 py-2.5 font-semibold whitespace-nowrap ${i ? "text-right" : ""}`}>{c}</th>)}
          </tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">Belum ada arus kas pada periode ini.</td></tr>}
            {rows.map((r) => (
              <tr key={r.date} className="border-t border-slate-100 hover:bg-secondary/40" data-testid={`cash-daily-row-${r.date}`}>
                <td className="px-3 py-2 whitespace-nowrap">{fmtDate(r.date)}</td>
                {KEYS.map((k) => <Cell key={k} k={k} v={r[k]} />)}
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="sticky bottom-0 bg-[#0F281E] text-white" data-testid="cash-daily-total">
              <tr><td className="px-3 py-2.5 font-bold">TOTAL</td>
                {KEYS.map((k) => <td key={k} className="px-3 py-2.5 text-right font-mono font-bold whitespace-nowrap">{OUT.has(k) ? `(${rupiah(total[k])})` : rupiah(total[k])}</td>)}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <p className="text-xs text-muted-foreground mt-3">Saldo berjalan dihitung dari awal periode (tanpa saldo awal kas). Total kolom sama dengan kotak Kas mode "Periode Ini".</p>
    </div>
  );
};
