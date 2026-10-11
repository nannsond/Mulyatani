import { Fragment, useEffect, useState } from "react";
import { PaymentHistory } from "@/components/PaymentHistory";
import { InstallmentReceipt } from "@/components/InstallmentReceipt";
import { api, apiError } from "@/lib/api";
import { rupiah, fmtDateTime, todayStr } from "@/lib/format";
import { HandCoins, X, History, ChevronDown } from "lucide-react";
import { toast } from "sonner";

export default function HutangPiutang() {
  const [tab, setTab] = useState("piutang");
  const [piutang, setPiutang] = useState([]);
  const [hutang, setHutang] = useState([]);
  const [pay, setPay] = useState(null);
  const [amount, setAmount] = useState("");
  const [payDate, setPayDate] = useState(todayStr());
  const [showAll, setShowAll] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [receipt, setReceipt] = useState(null);

  const load = () => {
    const qs = showAll ? "?all=true" : "";
    api.get(`/piutang${qs}`).then((r) => setPiutang(r.data));
    api.get(`/hutang${qs}`).then((r) => setHutang(r.data));
  };
  useEffect(() => { load(); }, [showAll]);

  const submitPay = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) { toast.error("Masukkan jumlah"); return; }
    try {
      const url = pay.kind === "piutang" ? `/transactions/${pay.id}/pay` : `/purchases/${pay.id}/pay`;
      const r = await api.post(url, { amount: amt, date: payDate });
      toast.success("Pembayaran dicatat");
      if (pay.kind === "piutang" && r.data.transaction) setReceipt({ tx: r.data.transaction, idx: r.data.transaction.payments.length - 1 });
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
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <p className="text-sm text-muted-foreground flex items-center gap-2"><HandCoins className="w-4 h-4" /> Total sisa {tab}: <span className="font-mono font-bold text-[#0F281E]">{rupiah(totalSisa)}</span></p>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} data-testid="hp-show-lunas" className="w-4 h-4 accent-[#1B5E3B]" />
            Tampilkan yang sudah lunas
          </label>
        </div>
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
                <Fragment key={x.id}>
                <tr className="border-b border-slate-100" data-testid={`hp-row-${x.id}`}>
                  <td className="px-4 py-2.5">
                    <p className="font-mono text-xs">{tab === "piutang" ? x.invoice_no : x.po_no}</p>
                    <p className="text-xs text-muted-foreground">{tab === "piutang" ? (x.customer_name || "-") : x.supplier}</p>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{fmtDateTime(x.created_at)}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{rupiah(x.total)}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{rupiah(x.amount_paid || 0)}</td>
                  <td className="px-4 py-2.5 text-right font-mono font-bold text-destructive">{x.sisa > 0 ? rupiah(x.sisa) : <span className="text-xs px-2 py-1 rounded-lg bg-emerald-100 text-emerald-700 font-sans" data-testid={`hp-lunas-${x.id}`}>Lunas</span>}</td>
                  <td className="px-4 py-2.5 text-center whitespace-nowrap">
                    <button onClick={() => setOpenId(openId === x.id ? null : x.id)} data-testid={`hp-history-toggle-${x.id}`}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 mr-2 rounded-lg border border-input text-xs hover:bg-secondary">
                      <History className="w-3.5 h-3.5" /> {(x.payments || []).length} <ChevronDown className={`w-3.5 h-3.5 transition-transform ${openId === x.id ? "rotate-180" : ""}`} />
                    </button>
                    {x.sisa > 0 && <button onClick={() => { setPay({ id: x.id, kind: tab, sisa: x.sisa }); setAmount(String(x.sisa)); setPayDate(todayStr()); }} data-testid={`hp-pay-${x.id}`}
                      className="px-3 py-1.5 rounded-lg bg-[#1B5E3B] text-white text-xs font-semibold hover:bg-[#143D2B]">Bayar</button>}
                  </td>
                </tr>
                {openId === x.id && <tr><td colSpan={6} className="px-4 pb-4"><PaymentHistory doc={x} kind={tab} /></td></tr>}
                </Fragment>
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
            <div className="mt-3">
                <label className="text-sm font-medium">{pay.kind === "piutang" ? "Tanggal uang diterima" : "Tanggal uang dibayarkan"}</label>
                <input type="date" value={payDate} max={todayStr()} onChange={(e) => setPayDate(e.target.value)} data-testid="hp-pay-date"
                  className="mt-1 w-full px-3 py-2.5 rounded-xl border border-input text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5E3B]" />
                <p className="text-xs text-muted-foreground mt-1">{pay.kind === "piutang" ? "Masuk ke kas pada tanggal ini." : "Keluar dari kas pada tanggal ini."}</p>
            </div>
            <button onClick={submitPay} data-testid="hp-pay-submit" className="mt-4 w-full bg-[#1B5E3B] text-white py-2.5 rounded-xl font-semibold hover:bg-[#143D2B]">Simpan</button>
          </div>
        </div>
      )}
      {receipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setReceipt(null)} />
          <div className="relative bg-white rounded-2xl w-full max-w-sm p-6" data-testid="installment-receipt-modal">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-heading font-bold text-lg">Pembayaran Tercatat</h3>
              <button onClick={() => setReceipt(null)} data-testid="installment-receipt-close"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              {receipt.tx.invoice_no} · Cicilan ke-{receipt.idx + 1}: <span className="font-mono font-semibold text-[#1B5E3B]">{rupiah(receipt.tx.payments[receipt.idx].amount)}</span>
              <br />Sisa: <span className="font-mono font-semibold">{receipt.tx.total - receipt.tx.amount_paid > 0 ? rupiah(receipt.tx.total - receipt.tx.amount_paid) : "LUNAS"}</span>
            </p>
            <InstallmentReceipt tx={receipt.tx} idx={receipt.idx} />
          </div>
        </div>
      )}
    </div>
  );
}
