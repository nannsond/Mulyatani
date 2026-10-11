import { useEffect, useState } from "react";
import { api, apiError } from "@/lib/api";
import { rupiah, fmtDateTime } from "@/lib/format";
import { HandCoins, X } from "lucide-react";
import { toast } from "sonner";

export default function HutangPiutang() {
  const [tab, setTab] = useState("piutang");
  const [piutang, setPiutang] = useState([]);
  const [hutang, setHutang] = useState([]);
  const [pay, setPay] = useState(null);
  const [amount, setAmount] = useState("");

  const load = () => {
    api.get("/piutang").then((r) => setPiutang(r.data));
    api.get("/hutang").then((r) => setHutang(r.data));
  };
  useEffect(() => { load(); }, []);

  const submitPay = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) { toast.error("Masukkan jumlah"); return; }
    try {
      const url = pay.kind === "piutang" ? `/transactions/${pay.id}/pay` : `/purchases/${pay.id}/pay`;
      await api.post(url, { amount: amt });
      toast.success("Pembayaran dicatat");
      setPay(null); setAmount(""); load();
    } catch (err) { toast.error(apiError(err.response?.data?.detail)); }
  };

  const list = tab === "piutang" ? piutang : hutang;
  const totalSisa = list.reduce((s, x) => s + x.sisa, 0);

  return (
    <div className="space-y-5">
      <div className="flex rounded-xl border border-input overflow-hidden w-fit" data-testid="hp-tab">
        <button onClick={() => setTab("piutang")} data-testid="hp-tab-piutang"
          className={`px-5 py-2.5 text-sm font-semibold ${tab === "piutang" ? "bg-[#1B5E3B] text-white" : "bg-card hover:bg-secondary"}`}>Piutang (Penjualan)</button>
        <button onClick={() => setTab("hutang")} data-testid="hp-tab-hutang"
          className={`px-5 py-2.5 text-sm font-semibold ${tab === "hutang" ? "bg-[#C85A32] text-white" : "bg-card hover:bg-secondary"}`}>Hutang (Supplier)</button>
      </div>

      <div className="bg-card rounded-2xl border border-slate-200 p-5">
        <p className="text-sm text-muted-foreground mb-3 flex items-center gap-2"><HandCoins className="w-4 h-4" /> Total sisa {tab}: <span className="font-mono font-bold text-[#0F281E]">{rupiah(totalSisa)}</span></p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-200 bg-secondary/50 text-left">
              <th className="px-4 py-2.5 font-semibold">{tab === "piutang" ? "Invoice / Pelanggan" : "No PO / Supplier"}</th>
              <th className="px-4 py-2.5 font-semibold">Tanggal</th>
              <th className="px-4 py-2.5 font-semibold text-right">Total</th>
              <th className="px-4 py-2.5 font-semibold text-right">Dibayar</th>
              <th className="px-4 py-2.5 font-semibold text-right">Sisa</th>
              <th className="px-4 py-2.5 font-semibold text-center">Aksi</th>
            </tr></thead>
            <tbody>
              {list.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Tidak ada {tab}.</td></tr>}
              {list.map((x) => (
                <tr key={x.id} className="border-b border-slate-100" data-testid={`hp-row-${x.id}`}>
                  <td className="px-4 py-2.5">
                    <p className="font-mono text-xs">{tab === "piutang" ? x.invoice_no : x.po_no}</p>
                    <p className="text-xs text-muted-foreground">{tab === "piutang" ? (x.customer_name || "-") : x.supplier}</p>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{fmtDateTime(x.created_at)}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{rupiah(x.total)}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{rupiah(x.amount_paid || 0)}</td>
                  <td className="px-4 py-2.5 text-right font-mono font-bold text-destructive">{rupiah(x.sisa)}</td>
                  <td className="px-4 py-2.5 text-center">
                    <button onClick={() => { setPay({ id: x.id, kind: tab, sisa: x.sisa }); setAmount(String(x.sisa)); }} data-testid={`hp-pay-${x.id}`}
                      className="px-3 py-1.5 rounded-lg bg-[#1B5E3B] text-white text-xs font-semibold hover:bg-[#143D2B]">Bayar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {pay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setPay(null)} />
          <div className="relative bg-white rounded-2xl w-full max-w-sm p-6" data-testid="hp-pay-modal">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-heading font-bold text-lg">Catat Pembayaran</h3>
              <button onClick={() => setPay(null)}><X className="w-5 h-5" /></button>
            </div>
            <p className="text-sm text-muted-foreground mb-2">Sisa: <span className="font-mono font-semibold text-[#0F281E]">{rupiah(pay.sisa)}</span></p>
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} data-testid="hp-pay-amount"
              className="w-full px-3 py-2.5 rounded-xl border border-input text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5E3B]" placeholder="Jumlah bayar" />
            <button onClick={submitPay} data-testid="hp-pay-submit" className="mt-4 w-full bg-[#1B5E3B] text-white py-2.5 rounded-xl font-semibold hover:bg-[#143D2B]">Simpan</button>
          </div>
        </div>
      )}
    </div>
  );
}
