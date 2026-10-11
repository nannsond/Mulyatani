import { rupiah, fmtDate } from "@/lib/format";
import { exportExcel } from "@/lib/exporter";
import { CalendarDays, FileSpreadsheet } from "lucide-react";

export default function DailyDiterima({ rows, periode }) {
  const sum = (k) => rows.reduce((t, r) => t + (r[k] || 0), 0);
  const cols = ["Tanggal", "Pesanan", "Omzet", "Potongan", "Diterima", "Sudah Cair", "Selisih", "Belum Cair"];
  const data = rows.map((r) => [r.date, r.transaksi, r.omzet, r.potongan, r.diterima, r.cair, r.selisih, r.belum_cair]);
  const foot = ["TOTAL", sum("transaksi"), sum("omzet"), sum("potongan"), sum("diterima"), sum("cair"), sum("selisih"), sum("belum_cair")];

  return (
    <div className="bg-card rounded-2xl border border-slate-200 p-6" data-testid="ecom-rep-daily">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
        <h3 className="font-heading font-semibold text-lg flex items-center gap-2"><CalendarDays className="w-5 h-5 text-[#2563EB]" /> Rekap Diterima Harian — {periode}</h3>
        <button onClick={() => exportExcel({ filename: `Diterima_Harian_${periode.replace(/\s+/g, "_")}`, sheetName: "Diterima", columns: cols, rows: [...data, foot] })}
          data-testid="ecom-daily-export" className="flex items-center gap-2 px-3 py-2 rounded-xl border border-input text-sm hover:bg-secondary"><FileSpreadsheet className="w-4 h-4" /> Excel</button>
      </div>
      <p className="text-sm text-muted-foreground mb-4">Diterima = omzet − potongan platform. Selisih = dana cair − diterima, hanya untuk pesanan yang sudah ditandai cair.</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-200 bg-secondary/50 text-left">
            <th className="px-3 py-2.5 font-semibold">Tanggal</th><th className="px-3 py-2.5 font-semibold text-right">Pesanan</th>
            <th className="px-3 py-2.5 font-semibold text-right">Omzet</th><th className="px-3 py-2.5 font-semibold text-right">Potongan</th>
            <th className="px-3 py-2.5 font-semibold text-right">Diterima</th><th className="px-3 py-2.5 font-semibold text-right">Sudah Cair</th>
            <th className="px-3 py-2.5 font-semibold text-right">Selisih</th><th className="px-3 py-2.5 font-semibold text-right">Belum Cair</th>
          </tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground" data-testid="ecom-daily-empty">Belum ada penjualan online pada periode ini.</td></tr>}
            {rows.map((r) => (
              <tr key={r.date} className="border-b border-slate-100" data-testid={`ecom-daily-row-${r.date}`}>
                <td className="px-3 py-2.5">{fmtDate(r.date)}</td>
                <td className="px-3 py-2.5 text-right">{r.transaksi}</td>
                <td className="px-3 py-2.5 text-right font-mono">{rupiah(r.omzet)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-destructive">-{rupiah(r.potongan)}</td>
                <td className="px-3 py-2.5 text-right font-mono font-semibold text-[#2563EB]">{rupiah(r.diterima)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-[#1B5E3B]">{rupiah(r.cair)}</td>
                <Selisih v={r.selisih} />
                <td className={`px-3 py-2.5 text-right ${r.belum_cair ? "text-amber-700 font-semibold" : "text-muted-foreground"}`}>{r.belum_cair}</td>
              </tr>
            ))}
            {rows.length > 0 && (
              <tr className="bg-secondary/40 font-semibold">
                <td className="px-3 py-2.5">TOTAL</td>
                <td className="px-3 py-2.5 text-right">{foot[1]}</td>
                <td className="px-3 py-2.5 text-right font-mono">{rupiah(foot[2])}</td>
                <td className="px-3 py-2.5 text-right font-mono text-destructive">-{rupiah(foot[3])}</td>
                <td className="px-3 py-2.5 text-right font-mono text-[#2563EB]" data-testid="ecom-daily-total">{rupiah(foot[4])}</td>
                <td className="px-3 py-2.5 text-right font-mono text-[#1B5E3B]" data-testid="ecom-daily-cair-total">{rupiah(foot[5])}</td>
                <Selisih v={foot[6]} testid="ecom-daily-selisih-total" />
                <td className="px-3 py-2.5 text-right">{foot[7]}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Selisih({ v, testid }) {
  const cls = v === 0 ? "text-muted-foreground" : v > 0 ? "text-green-700" : "text-destructive";
  return <td className={`px-3 py-2.5 text-right font-mono ${cls}`} data-testid={testid}>{v > 0 ? "+" : v < 0 ? "-" : ""}{rupiah(Math.abs(v))}</td>;
}
