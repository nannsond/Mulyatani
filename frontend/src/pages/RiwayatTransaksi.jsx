import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { rupiah, fmtDateTime } from "@/lib/format";
import { printReceipt, exportPDF, exportExcel } from "@/lib/exporter";
import { useSettings } from "@/context/SettingsContext";
import { Search, Printer, Loader2, FileDown, FileSpreadsheet, X, Eye } from "lucide-react";

export default function RiwayatTransaksi() {
  const { settings } = useSettings();
  const [txs, setTxs] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);

  const logoUrl = settings?.has_logo
    ? `${process.env.REACT_APP_BACKEND_URL}/api/settings/logo?v=${encodeURIComponent(settings.logo_updated || "")}`
    : undefined;
  const storeInfo = { store_name: settings?.store_name, address: settings?.address, phone: settings?.phone };

  const load = (query = "") => {
    setLoading(true);
    const url = `/transactions?limit=100${query ? `&q=${encodeURIComponent(query)}` : ""}`;
    api.get(url).then((r) => setTxs(r.data)).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const onSearch = (e) => { e.preventDefault(); load(q); };

  const cols = ["Invoice", "Waktu", "Kasir", "Pembayaran", "Item", "Total"];
  const rows = txs.map((t) => [t.invoice_no, fmtDateTime(t.created_at), t.cashier_name, t.payment_method, t.items.reduce((s, i) => s + i.qty, 0), t.total]);
  const foot = ["", "", "", "", "TOTAL", txs.reduce((s, t) => s + t.total, 0)];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <form onSubmit={onSearch} className="flex gap-2 flex-1 max-w-md">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} data-testid="riwayat-search-input"
              placeholder="Cari no. invoice..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5E3B]" />
          </div>
          <button type="submit" data-testid="riwayat-search-button" className="px-4 py-2.5 rounded-xl bg-[#1B5E3B] text-white text-sm font-semibold hover:bg-[#143D2B]">Cari</button>
        </form>
        <div className="flex gap-2">
          <button onClick={() => exportPDF({ title: "Riwayat Transaksi", subtitle: q ? `Filter: ${q}` : "Semua transaksi terbaru", columns: cols, rows, foot })} data-testid="export-pdf-button"
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-input text-sm hover:bg-secondary"><FileDown className="w-4 h-4" /> PDF</button>
          <button onClick={() => exportExcel({ filename: "Riwayat_Transaksi", sheetName: "Riwayat", columns: cols, rows })} data-testid="export-excel-button"
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-input text-sm hover:bg-secondary"><FileSpreadsheet className="w-4 h-4" /> Excel</button>
        </div>
      </div>

      {loading ? <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-[#1B5E3B]" /></div> : (
        <div className="bg-card rounded-2xl border border-slate-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-secondary/50 text-left">
                <th className="px-4 py-3 font-semibold">Invoice</th>
                <th className="px-4 py-3 font-semibold">Waktu</th>
                <th className="px-4 py-3 font-semibold">Kasir</th>
                <th className="px-4 py-3 font-semibold">Pembayaran</th>
                <th className="px-4 py-3 font-semibold text-center">Item</th>
                <th className="px-4 py-3 font-semibold text-right">Total</th>
                <th className="px-4 py-3 font-semibold text-center">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {txs.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">Tidak ada transaksi.</td></tr>}
              {txs.map((t) => (
                <tr key={t.id} onClick={() => setDetail(t)} className="border-b border-slate-100 hover:bg-secondary/30 cursor-pointer" data-testid={`riwayat-row-${t.id}`}>
                  <td className="px-4 py-3 font-mono text-xs">{t.invoice_no}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{fmtDateTime(t.created_at)}</td>
                  <td className="px-4 py-3">{t.cashier_name}</td>
                  <td className="px-4 py-3"><span className="text-xs px-2 py-1 rounded-lg bg-secondary">{t.payment_method}</span></td>
                  <td className="px-4 py-3 text-center font-mono">{t.items.reduce((s, i) => s + i.qty, 0)}</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-[#1B5E3B]">{rupiah(t.total)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => setDetail(t)} data-testid={`riwayat-detail-${t.id}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-input text-xs hover:bg-secondary"><Eye className="w-3.5 h-3.5" /> Detail</button>
                      <button onClick={() => printReceipt(t, logoUrl, storeInfo)} data-testid={`riwayat-print-${t.id}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-input text-xs hover:bg-secondary"><Printer className="w-3.5 h-3.5" /> Cetak</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDetail(null)} />
          <div className="relative bg-white rounded-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto" data-testid="riwayat-detail-modal">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-heading font-bold text-lg">Detail Transaksi</h3>
              <button onClick={() => setDetail(null)} data-testid="riwayat-detail-close"><X className="w-5 h-5" /></button>
            </div>
            <p className="font-mono text-sm text-muted-foreground">{detail.invoice_no}</p>
            <div className="mt-3 text-sm space-y-1 pb-3 border-b border-slate-200">
              <div className="flex justify-between"><span className="text-muted-foreground">Waktu</span><span>{fmtDateTime(detail.created_at)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Kasir</span><span>{detail.cashier_name}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Pembayaran</span><span>{detail.payment_method}</span></div>
            </div>
            <div className="mt-3 space-y-2">
              {detail.items.map((i, idx) => (
                <div key={idx} className="flex justify-between gap-3 text-sm" data-testid={`detail-item-${idx}`}>
                  <div className="min-w-0">
                    <p className="font-medium truncate">{i.name}</p>
                    <p className="text-xs font-mono text-muted-foreground">{i.qty} x {rupiah(i.harga)}</p>
                  </div>
                  <span className="font-mono shrink-0">{rupiah(i.subtotal)}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-slate-200 flex justify-between items-center">
              <span className="font-semibold">Total</span>
              <span className="font-mono font-bold text-xl text-[#1B5E3B]">{rupiah(detail.total)}</span>
            </div>
            <button onClick={() => printReceipt(detail, logoUrl, storeInfo)} data-testid="riwayat-detail-print"
              className="mt-4 w-full flex items-center justify-center gap-2 bg-[#1B5E3B] text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-[#143D2B]">
              <Printer className="w-4 h-4" /> Cetak Struk PDF
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
