import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { rupiah, fmtDateTime } from "@/lib/format";
import { printReceipt } from "@/lib/exporter";
import { useSettings } from "@/context/SettingsContext";
import { Search, Printer, Loader2, Receipt } from "lucide-react";

export default function RiwayatTransaksi() {
  const { settings } = useSettings();
  const [txs, setTxs] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  const logoUrl = settings?.has_logo
    ? `${process.env.REACT_APP_BACKEND_URL}/api/settings/logo?v=${encodeURIComponent(settings.logo_updated || "")}`
    : undefined;

  const load = (query = "") => {
    setLoading(true);
    const url = `/transactions?limit=100${query ? `&q=${encodeURIComponent(query)}` : ""}`;
    api.get(url).then((r) => setTxs(r.data)).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const onSearch = (e) => { e.preventDefault(); load(q); };

  return (
    <div className="space-y-5">
      <form onSubmit={onSearch} className="flex gap-2 max-w-md">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} data-testid="riwayat-search-input"
            placeholder="Cari no. invoice..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5E3B]" />
        </div>
        <button type="submit" data-testid="riwayat-search-button" className="px-4 py-2.5 rounded-xl bg-[#1B5E3B] text-white text-sm font-semibold hover:bg-[#143D2B]">Cari</button>
      </form>

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
                <th className="px-4 py-3 font-semibold text-center">Struk</th>
              </tr>
            </thead>
            <tbody>
              {txs.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">Tidak ada transaksi.</td></tr>}
              {txs.map((t) => (
                <tr key={t.id} className="border-b border-slate-100 hover:bg-secondary/30" data-testid={`riwayat-row-${t.id}`}>
                  <td className="px-4 py-3 font-mono text-xs">{t.invoice_no}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{fmtDateTime(t.created_at)}</td>
                  <td className="px-4 py-3">{t.cashier_name}</td>
                  <td className="px-4 py-3"><span className="text-xs px-2 py-1 rounded-lg bg-secondary">{t.payment_method}</span></td>
                  <td className="px-4 py-3 text-center font-mono">{t.items.reduce((s, i) => s + i.qty, 0)}</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-[#1B5E3B]">{rupiah(t.total)}</td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => printReceipt(t, logoUrl)} data-testid={`riwayat-print-${t.id}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-input text-xs hover:bg-secondary">
                      <Printer className="w-3.5 h-3.5" /> Cetak
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
