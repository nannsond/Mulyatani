import { useState } from "react";
import { api, apiError } from "@/lib/api";
import { rupiah, todayStr } from "@/lib/format";
import { Landmark, Plus } from "lucide-react";
import { toast } from "sonner";

const EMPTY = { lender: "", principal: "", interest_rate: "", tenor: "12", start_date: todayStr(), note: "", disbursed: true, disbursed_date: todayStr() };
const inputCls = "mt-1 w-full px-3 py-2.5 rounded-xl border border-input text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5E3B]";

const Field = ({ label, children }) => (
  <div><label className="text-sm font-medium">{label}</label>{children}</div>
);

export const LoanForm = ({ onSaved }) => {
  const [f, setF] = useState(EMPTY);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const p = Number(f.principal) || 0, r = Number(f.interest_rate) || 0, t = Number(f.tenor) || 0;
  const bunga = Math.round(p * r / 100 * t / 12);
  const cicilan = t > 0 ? Math.round((p + bunga) / t) : 0;

  const submit = async (e) => {
    e.preventDefault();
    if (!f.lender.trim() || p <= 0 || t <= 0) { toast.error("Lengkapi pemberi pinjaman, jumlah pokok, dan tenor"); return; }
    try {
      await api.post("/loans", { lender: f.lender.trim(), principal: p, interest_rate: r, tenor: t, start_date: f.start_date, note: f.note, disbursed: f.disbursed, disbursed_date: f.disbursed_date });
      toast.success("Pinjaman dicatat");
      setF(EMPTY); onSaved();
    } catch (err) { toast.error(apiError(err.response?.data?.detail)); }
  };

  return (
    <form onSubmit={submit} className="bg-card rounded-2xl border border-slate-200 p-6 h-fit space-y-4" data-testid="loan-form">
      <h3 className="font-heading font-semibold text-lg flex items-center gap-2"><Landmark className="w-5 h-5 text-[#C85A32]" /> Catat Pinjaman Modal</h3>
      <Field label="Pemberi Pinjaman"><input value={f.lender} onChange={set("lender")} data-testid="loan-lender-input" className={inputCls} placeholder="Bank BRI / Koperasi / Nama" /></Field>
      <Field label="Jumlah Pokok (Rp)"><input type="number" value={f.principal} onChange={set("principal")} data-testid="loan-principal-input" className={inputCls} placeholder="0" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Bunga (% / tahun)"><input type="number" step="0.01" value={f.interest_rate} onChange={set("interest_rate")} data-testid="loan-interest-input" className={inputCls} placeholder="0" /></Field>
        <Field label="Tenor (bulan)"><input type="number" value={f.tenor} onChange={set("tenor")} data-testid="loan-tenor-input" className={inputCls} /></Field>
      </div>
      <Field label="Tanggal Mulai"><input type="date" value={f.start_date} onChange={set("start_date")} data-testid="loan-start-input" className={inputCls} /></Field>
      <Field label="Catatan"><input value={f.note} onChange={set("note")} data-testid="loan-note-input" className={inputCls} placeholder="Opsional" /></Field>
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 space-y-2">
        <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
          <input type="checkbox" checked={f.disbursed} onChange={(e) => setF({ ...f, disbursed: e.target.checked })} data-testid="loan-disbursed-checkbox" className="w-4 h-4 accent-[#1B5E3B]" />
          Dana pinjaman sudah cair & masuk kas toko
        </label>
        {f.disbursed && <Field label="Tanggal Dana Masuk"><input type="date" value={f.disbursed_date} onChange={set("disbursed_date")} data-testid="loan-disbursed-date-input" className={inputCls} /></Field>}
      </div>
      <div className="rounded-xl bg-secondary/60 p-3 text-sm space-y-1" data-testid="loan-preview">
        <div className="flex justify-between"><span className="text-muted-foreground">Total bunga (flat)</span><span className="font-mono">{rupiah(bunga)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Total kewajiban</span><span className="font-mono">{rupiah(p + bunga)}</span></div>
        <div className="flex justify-between font-semibold"><span>Cicilan / bulan</span><span className="font-mono text-[#C85A32]" data-testid="loan-preview-installment">{rupiah(cicilan)}</span></div>
      </div>
      <button type="submit" data-testid="loan-save-button" className="w-full bg-[#1B5E3B] text-white py-3 rounded-xl font-semibold hover:bg-[#143D2B] flex items-center justify-center gap-2"><Plus className="w-4 h-4" /> Simpan Pinjaman</button>
    </form>
  );
};
