import { useState } from "react";
import { api, apiError } from "@/lib/api";
import { rupiah, fmtDate, todayStr } from "@/lib/format";
import { Trash2, Wallet, ChevronDown, ArrowDownToLine } from "lucide-react";
import { toast } from "sonner";
import { LoanPayDialog } from "@/components/LoanPayDialog";

const Info = ({ label, value, cls = "" }) => (
  <div><p className="text-xs text-muted-foreground">{label}</p><p className={`font-mono font-semibold text-sm ${cls}`}>{value}</p></div>
);

export const LoanCard = ({ loan: l, onChange }) => {
  const [payOpen, setPayOpen] = useState(false);
  const [showHist, setShowHist] = useState(false);
  const pct = l.total_due > 0 ? Math.min(100, (l.paid / l.total_due) * 100) : 0;
  const lunas = l.status === "Lunas";

  const delLoan = async () => {
    if (!window.confirm("Hapus pinjaman ini? Semua cicilan di Pengeluaran ikut terhapus.")) return;
    try { await api.delete(`/loans/${l.id}`); toast.success("Pinjaman dihapus"); onChange(); }
    catch (err) { toast.error(apiError(err.response?.data?.detail)); }
  };
  const toggleDisburse = async () => {
    const msg = l.disbursed ? "Batalkan pencatatan dana masuk kas?" : "Catat dana pinjaman masuk kas hari ini?";
    if (!window.confirm(msg)) return;
    try {
      await api.patch(`/loans/${l.id}/disbursement`, { disbursed: !l.disbursed, disbursed_date: l.disbursed ? null : todayStr() });
      toast.success(l.disbursed ? "Dana masuk dibatalkan" : "Dana masuk kas dicatat"); onChange();
    } catch (err) { toast.error(apiError(err.response?.data?.detail)); }
  };
  const delPay = async (pid) => {
    if (!window.confirm("Hapus pembayaran ini?")) return;
    try { await api.delete(`/loans/${l.id}/payments/${pid}`); toast.success("Pembayaran dihapus"); onChange(); }
    catch (err) { toast.error(apiError(err.response?.data?.detail)); }
  };

  return (
    <div className="bg-card rounded-2xl border border-slate-200 p-6" data-testid={`loan-card-${l.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="font-heading font-semibold text-lg">{l.lender}</h4>
          <p className="text-xs text-muted-foreground">Mulai {fmtDate(l.start_date)} · {l.tenor} bulan · bunga {l.interest_rate}%/thn{l.note ? ` · ${l.note}` : ""}</p>
        </div>
        <span data-testid={`loan-status-${l.id}`} className={`text-xs px-2.5 py-1 rounded-lg font-semibold ${lunas ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{l.status}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
        <Info label="Pokok" value={rupiah(l.principal)} />
        <Info label="Total Kewajiban" value={rupiah(l.total_due)} />
        <Info label="Cicilan / bulan" value={rupiah(l.installment)} cls="text-[#C85A32]" />
        <Info label="Sisa Hutang" value={rupiah(l.remaining)} cls="text-destructive" />
      </div>
      <div className="mt-4">
        <div className="h-2 rounded-full bg-secondary overflow-hidden"><div className="h-full bg-[#1B5E3B] transition-[width] duration-500" style={{ width: `${pct}%` }} /></div>
        <div className="flex justify-between text-xs text-muted-foreground mt-1.5">
          <span data-testid={`loan-paid-${l.id}`}>Terbayar {rupiah(l.paid)} ({l.payments.length}/{l.tenor} cicilan)</span>
          <span>{lunas ? `Jatuh tempo ${fmtDate(l.due_date)}` : `Cicilan berikutnya ${fmtDate(l.next_due_date)} · Jatuh tempo ${fmtDate(l.due_date)}`}</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 mt-4">
        {!lunas && <button onClick={() => setPayOpen(true)} data-testid={`loan-pay-button-${l.id}`} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#1B5E3B] text-white text-sm font-semibold hover:bg-[#143D2B]"><Wallet className="w-4 h-4" /> Bayar Cicilan</button>}
        <button onClick={() => setShowHist(!showHist)} data-testid={`loan-history-toggle-${l.id}`} className="flex items-center gap-1 px-4 py-2 rounded-xl border border-input text-sm hover:bg-secondary">Riwayat <ChevronDown className={`w-4 h-4 transition-transform ${showHist ? "rotate-180" : ""}`} /></button>
        <button onClick={toggleDisburse} data-testid={`loan-disburse-toggle-${l.id}`} title={l.disbursed ? "Klik untuk membatalkan" : "Klik untuk mencatat dana masuk kas"}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm border ${l.disbursed ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-dashed border-input text-muted-foreground hover:bg-secondary"}`}>
          <ArrowDownToLine className="w-4 h-4" /> {l.disbursed ? `Masuk kas ${fmtDate(l.disbursed_date)}` : "Catat Dana Masuk Kas"}
        </button>
        <button onClick={delLoan} data-testid={`loan-delete-${l.id}`} className="ml-auto flex items-center gap-1 px-3 py-2 rounded-xl text-destructive text-sm hover:bg-red-50"><Trash2 className="w-4 h-4" /> Hapus</button>
      </div>
      {showHist && (
        <table className="w-full text-sm mt-4" data-testid={`loan-history-${l.id}`}>
          <tbody>
            {l.payments.length === 0 && <tr><td className="py-3 text-center text-muted-foreground">Belum ada pembayaran.</td></tr>}
            {l.payments.map((p, i) => (
              <tr key={p.id} className="border-t border-slate-100">
                <td className="py-2 text-xs text-muted-foreground">#{i + 1} · {fmtDate(p.date)}</td>
                <td className="py-2">{p.note}</td>
                <td className="py-2 text-right font-mono font-semibold">{rupiah(p.amount)}</td>
                <td className="py-2 text-center w-10"><button onClick={() => delPay(p.id)} data-testid={`loan-payment-delete-${p.id}`} className="text-destructive"><Trash2 className="w-4 h-4" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <LoanPayDialog loan={l} open={payOpen} onOpenChange={setPayOpen} onPaid={onChange} />
    </div>
  );
};
