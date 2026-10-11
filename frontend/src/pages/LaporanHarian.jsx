import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { rupiah, fmtDateTime, todayStr } from "@/lib/format";
import { exportPDF, exportExcel } from "@/lib/exporter";
import { FileDown, FileSpreadsheet, Loader2, Receipt, Wallet, Package, Truck, Banknote, TrendingUp } from "lucide-react";

function Stat({ label, value, icon: Icon, tone = "text-[#0F281E]", testid, highlight }) {
  return (
    <div className={`bg-card rounded-2xl p-5 ${highlight ? "border-2 border-[#1B5E3B]/30" : "border border-slate-200"}`} data-testid={testid}>
      <div className="flex items-center gap-2 text-muted-foreground mb-2">
        <Icon className="w-4 h-4" /><span className="text-xs font-semibold uppercase tracking-wider">{label}</span>
      </div>
      <p className={`font-mono font-bold text-2xl ${tone}`}>{value}</p>
    </div>
  );
}

export default function LaporanHarian() {
  const [date, setDate] = useState(todayStr());
  const [data, setData] = useState(null);

  useEffect(() => {
    setData(null);
    api.get(`/reports/daily?date=${date}`).then((r) => setData(r.data));
  }, [date]);

  const cols = ["Invoice", "Waktu", "Kasir", "Pembayaran", "Item", "Total"];
  const rows = data?.transactions.map((t) => [t.invoice_no, fmtDateTime(t.created_at), t.cashier_name, t.payment_method, t.items.reduce((s, i) => s + i.qty, 0), t.total]) || [];
  const s = data?.summary;
  const summaryRows = s ? [["", "", "", "", "Laba Kotor", s.total_laba], ["", "", "", "", "Potongan Platform", s.potongan_platform || 0],
    ["", "", "", "", "Pengeluaran", s.total_pengeluaran || 0], ["", "", "", "", "Laba Bersih", s.laba_bersih ?? s.total_laba]] : [];
  const expRows = (data?.expenses || []).map((e) => ["", "", "Pengeluaran", e.category, e.note, -e.amount]);
  const exportRows = [...rows, ...expRows, ...summaryRows];
  const foot = data ? ["", "", "", "", "TOTAL", data.summary.total_omzet] : null;
  const sub = `Laporan Harian - ${date}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="filter-date-picker"
          className="px-4 py-2.5 rounded-xl border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5E3B]" />
        <div className="flex gap-2">
          <button onClick={() => exportPDF({ title: "Laporan Penjualan Harian", subtitle: sub, columns: cols, rows: exportRows, foot })} data-testid="export-pdf-button"
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-input text-sm hover:bg-secondary"><FileDown className="w-4 h-4" /> PDF</button>
          <button onClick={() => exportExcel({ filename: `Laporan_Harian_${date}`, sheetName: "Harian", columns: cols, rows: exportRows })} data-testid="export-excel-button"
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-input text-sm hover:bg-secondary"><FileSpreadsheet className="w-4 h-4" /> Excel</button>
        </div>
      </div>

      {!data ? <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-[#1B5E3B]" /></div> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Stat label="Total Omzet" value={rupiah(data.summary.total_omzet)} icon={Wallet} testid="stat-omzet" />
            <Stat label="Laba Kotor" value={rupiah(data.summary.total_laba)} icon={Wallet} testid="stat-laba-kotor" />
            <Stat label="Pengeluaran" value={rupiah(data.summary.total_pengeluaran || 0)} icon={Banknote} tone="text-destructive" testid="stat-pengeluaran" />
            <Stat label="Laba Bersih" value={rupiah(data.summary.laba_bersih ?? data.summary.total_laba)} icon={TrendingUp} highlight
              tone={(data.summary.laba_bersih ?? 0) < 0 ? "text-destructive" : "text-[#1B5E3B]"} testid="stat-laba-bersih" />
            <Stat label="Transaksi" value={data.summary.jumlah_transaksi} icon={Receipt} />
            <Stat label="Item Terjual" value={data.summary.total_item} icon={Package} />
            <Stat label="Rata-rata" value={rupiah(data.summary.rata_rata)} icon={Wallet} />
            <Stat label="Ongkos Kirim" value={rupiah(data.summary.total_ongkir || 0)} icon={Truck} />
          </div>
          {data.summary.potongan_platform > 0 && (
            <p className="text-xs text-muted-foreground" data-testid="daily-potongan-note">Laba bersih = laba kotor − potongan platform marketplace ({rupiah(data.summary.potongan_platform)}) − pengeluaran.</p>
          )}

          <div className="bg-card rounded-2xl border border-slate-200 overflow-x-auto" data-testid="daily-expenses-table">
            <div className="px-4 py-3 border-b border-slate-200 font-heading font-semibold flex items-center gap-2"><Banknote className="w-4 h-4 text-[#C85A32]" /> Pengeluaran Hari Ini</div>
            <table className="w-full text-sm">
              <tbody>
                {data.expenses.length === 0 && <tr><td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">Tidak ada pengeluaran pada tanggal ini.</td></tr>}
                {data.expenses.map((e) => (
                  <tr key={e.id} className="border-b border-slate-100" data-testid={`daily-expense-row-${e.id}`}>
                    <td className="px-4 py-3"><span className="text-xs px-2 py-1 rounded-lg bg-secondary">{e.category}</span></td>
                    <td className="px-4 py-3">{e.note}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-destructive">{rupiah(e.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-card rounded-2xl border border-slate-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-secondary/50 text-left">
                  <th className="px-4 py-3 font-semibold">Invoice</th>
                  <th className="px-4 py-3 font-semibold">Waktu</th>
                  <th className="px-4 py-3 font-semibold">Kasir</th>
                  <th className="px-4 py-3 font-semibold">Pembayaran</th>
                  <th className="px-4 py-3 font-semibold text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.transactions.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">Tidak ada transaksi pada tanggal ini.</td></tr>}
                {data.transactions.map((t) => (
                  <tr key={t.id} className="border-b border-slate-100 hover:bg-secondary/30" data-testid={`tx-row-${t.id}`}>
                    <td className="px-4 py-3 font-mono text-xs">{t.invoice_no}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{fmtDateTime(t.created_at)}</td>
                    <td className="px-4 py-3">{t.cashier_name}</td>
                    <td className="px-4 py-3"><span className="text-xs px-2 py-1 rounded-lg bg-secondary">{t.payment_method}</span></td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-[#1B5E3B]">{rupiah(t.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
