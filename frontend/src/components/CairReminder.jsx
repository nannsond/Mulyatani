import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { rupiah, fmtDate } from "@/lib/format";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CairCell } from "@/components/CairCell";
import { BellRing, CheckCircle2, AlarmClock } from "lucide-react";

const diterima = (s) => (s.omzet || 0) - (s.admin_fee || 0);
export const OVERDUE_DAYS = 7;
const isOverdue = (s) => (s.umur_hari || 0) > OVERDUE_DAYS;

function ReminderTable({ list, onSaved }) {
  return (
    <table className="w-full text-sm">
      <thead className="sticky top-0 bg-secondary"><tr className="text-left">
        <th className="px-3 py-2 font-semibold">Pesanan</th><th className="px-3 py-2 font-semibold">Tanggal</th>
        <th className="px-3 py-2 font-semibold text-center">Umur</th>
        <th className="px-3 py-2 font-semibold text-right">Estimasi Diterima</th><th className="px-3 py-2 font-semibold text-right">Cair</th>
      </tr></thead>
      <tbody>
        {list.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">Semua sudah dicatat.</td></tr>}
        {list.map((s) => (
          <tr key={s.id} className="border-t border-slate-100 align-top" data-testid={`cair-reminder-row-${s.id}`}>
            <td className="px-3 py-2"><p className="font-medium">{s.channel} <span className="font-mono text-xs text-muted-foreground">{s.ecom_no}</span></p>
              <p className="text-xs text-muted-foreground">{[s.order_no, s.customer_name].filter(Boolean).join(" · ") || "-"}</p></td>
            <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{fmtDate(s.created_at)}</td>
            <td className="px-3 py-2 text-center">
              <span data-testid={`cair-reminder-age-${s.id}`} className={`text-xs font-semibold px-2 py-0.5 rounded-lg ${isOverdue(s) ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"}`}>{s.umur_hari || 0} hari</span>
            </td>
            <td className="px-3 py-2 text-right font-mono">{rupiah(diterima(s))}</td>
            <td className="px-3 py-2 text-right"><CairCell sale={s} isAdmin onSaved={onSaved} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export const CairReminder = ({ onChanged, overdueOnly = false }) => {
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(false);
  const [onlyLate, setOnlyLate] = useState(overdueOnly);
  const load = () => api.get("/ecommerce/belum-cair").then((r) => setList(r.data));
  useEffect(() => { load(); }, []);
  const saved = () => { load(); onChanged?.(); };

  const late = list.filter(isOverdue);
  if (overdueOnly && late.length === 0) return null;
  if (list.length === 0) return (
    <div className="mt-3 flex items-center gap-2 text-xs text-emerald-700" data-testid="cair-reminder-done">
      <CheckCircle2 className="w-4 h-4" /> Semua pesanan online Selesai sudah dicatat cair.
    </div>
  );

  const shown = [...(onlyLate ? late : list)].sort((a, b) => (b.umur_hari || 0) - (a.umur_hari || 0));
  const base = overdueOnly ? late : list;
  const total = base.reduce((s, x) => s + diterima(x), 0);
  const tone = late.length ? "border-red-200 bg-red-50/70" : "border-sky-200 bg-sky-50/70";
  return (
    <>
      <div className={`${overdueOnly ? "" : "mt-3"} flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 ${tone}`} data-testid={overdueOnly ? "cair-overdue-banner" : "cair-reminder"}>
        <div className="flex items-center gap-3">
          {late.length ? <AlarmClock className="w-5 h-5 text-red-600" /> : <BellRing className="w-5 h-5 text-sky-600" />}
          <div>
            <p className={`text-sm font-semibold ${late.length ? "text-red-900" : "text-sky-900"}`} data-testid="cair-reminder-count">
              {overdueOnly ? `${late.length} pesanan Selesai lebih dari ${OVERDUE_DAYS} hari belum dicatat cair` : `${list.length} pesanan Selesai belum dicatat cair`}
            </p>
            <p className={`text-xs ${late.length ? "text-red-700" : "text-sky-700"}`}>
              {!overdueOnly && late.length > 0 && <b data-testid="cair-reminder-overdue-count">{late.length} sudah lebih dari {OVERDUE_DAYS} hari · </b>}
              Estimasi {rupiah(total)}. Cek saldo marketplace lalu catat nominal & tanggal cair.
            </p>
          </div>
        </div>
        <button onClick={() => setOpen(true)} data-testid={overdueOnly ? "cair-overdue-open" : "cair-reminder-open"}
          className={`px-4 py-2 rounded-xl text-white text-sm font-semibold ${late.length ? "bg-red-600 hover:bg-red-700" : "bg-sky-700 hover:bg-sky-800"}`}>Lihat & Catat</button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl" data-testid="cair-reminder-dialog">
          <DialogHeader><DialogTitle>Pesanan Selesai Belum Dicatat Cair</DialogTitle></DialogHeader>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={onlyLate} onChange={(e) => setOnlyLate(e.target.checked)} data-testid="cair-reminder-only-late" />
            Hanya yang lebih dari {OVERDUE_DAYS} hari ({late.length})
          </label>
          <div className="max-h-[60vh] overflow-y-auto"><ReminderTable list={shown} onSaved={saved} /></div>
        </DialogContent>
      </Dialog>
    </>
  );
};
