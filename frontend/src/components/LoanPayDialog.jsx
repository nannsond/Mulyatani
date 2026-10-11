import { useEffect, useState } from "react";
import { api, apiError } from "@/lib/api";
import { rupiah, todayStr } from "@/lib/format";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

const inputCls = "mt-1 w-full px-3 py-2.5 rounded-xl border border-input text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5E3B]";

export const LoanPayDialog = ({ loan, open, onOpenChange, onPaid }) => {
  const [f, setF] = useState({ amount: "", date: todayStr(), note: "" });
  useEffect(() => {
    if (open) setF({ amount: String(Math.min(loan.installment, loan.remaining)), date: todayStr(), note: "" });
  }, [open, loan.installment, loan.remaining]);

  const submit = async (e) => {
    e.preventDefault();
    const amount = Number(f.amount);
    if (amount <= 0) { toast.error("Masukkan jumlah"); return; }
    try {
      await api.post(`/loans/${loan.id}/payments`, { amount, date: f.date, note: f.note });
      toast.success("Cicilan dibayar & dicatat di Pengeluaran");
      onOpenChange(false); onPaid();
    } catch (err) { toast.error(apiError(err.response?.data?.detail)); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="loan-pay-dialog">
        <DialogHeader><DialogTitle>Bayar Cicilan – {loan.lender}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <p className="text-sm text-muted-foreground">Sisa hutang: <span className="font-mono font-bold text-destructive">{rupiah(loan.remaining)}</span></p>
          <div><label className="text-sm font-medium">Jumlah (Rp)</label>
            <input type="number" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} data-testid="loan-pay-amount-input" className={inputCls} /></div>
          <div><label className="text-sm font-medium">Tanggal</label>
            <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} data-testid="loan-pay-date-input" className={inputCls} /></div>
          <div><label className="text-sm font-medium">Catatan</label>
            <input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} data-testid="loan-pay-note-input" className={inputCls} placeholder="Opsional" /></div>
          <button type="submit" data-testid="loan-pay-submit-button" className="w-full bg-[#1B5E3B] text-white py-3 rounded-xl font-semibold hover:bg-[#143D2B]">Simpan Pembayaran</button>
        </form>
      </DialogContent>
    </Dialog>
  );
};
