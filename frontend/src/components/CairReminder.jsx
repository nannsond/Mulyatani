import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { rupiah, fmtDate } from "@/lib/format";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CairCell } from "@/components/CairCell";
import { BellRing, CheckCircle2 } from "lucide-react";

const diterima = (s) => (s.omzet || 0) - (s.admin_fee || 0);

export const CairReminder = ({ onChanged }) => {
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(false);
  const load = () => api.get("/ecommerce/belum-cair").then((r) => setList(r.data));
  useEffect(() => { load(); }, []);
  const saved = () => { load(); onChanged(); };

  if (list.length === 0) return (
    <div className="mt-3 flex items-center gap-2 text-xs text-emerald-700" data-testid="cair-reminder-done">
      <CheckCircle2 className="w-4 h-4" /> Semua pesanan online Selesai sudah dicatat cair.
    </div>
  );

  const total = list.reduce((s, x) => s + diterima(x), 0);
  return (
    <>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50/70 px-4 py-3" data-testid="cair-reminder">
        <div className="flex items-center gap-3">
          <BellRing className="w-5 h-5 text-sky-600" />
          <div>
            <p className="text-sm font-semibold text-sky-900" data-testid="cair-reminder-count">{list.length} pesanan Selesai belum dicatat cair</p>
            <p className="text-xs text-sky-700">Kas memakai estimasi {rupiah(total)}. Catat nominal & tanggal cair agar kas akurat.</p>
          </div>
        </div>
        <button onClick={() => setOpen(true)} data-testid="cair-reminder-open" className="px-4 py-2 rounded-xl bg-sky-700 text-white text-sm font-semibold hover:bg-sky-800">Lihat & Catat</button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl" data-testid="cair-reminder-dialog">
          <DialogHeader><DialogTitle>Pesanan Selesai Belum Dicatat Cair</DialogTitle></DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-secondary"><tr className="text-left">
                <th className="px-3 py-2 font-semibold">Pesanan</th><th className="px-3 py-2 font-semibold">Tanggal</th>
                <th className="px-3 py-2 font-semibold text-right">Estimasi Diterima</th><th className="px-3 py-2 font-semibold text-right">Cair</th>
              </tr></thead>
              <tbody>
                {list.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-muted-foreground">Semua sudah dicatat.</td></tr>}
                {list.map((s) => (
                  <tr key={s.id} className="border-t border-slate-100 align-top" data-testid={`cair-reminder-row-${s.id}`}>
                    <td className="px-3 py-2"><p className="font-medium">{s.channel} <span className="font-mono text-xs text-muted-foreground">{s.ecom_no}</span></p>
                      <p className="text-xs text-muted-foreground">{[s.order_no, s.customer_name].filter(Boolean).join(" · ") || "-"}</p></td>
                    <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{fmtDate(s.created_at)}</td>
                    <td className="px-3 py-2 text-right font-mono">{rupiah(diterima(s))}</td>
                    <td className="px-3 py-2 text-right"><CairCell sale={s} isAdmin onSaved={saved} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
