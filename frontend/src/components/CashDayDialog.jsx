import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { rupiah, fmtDate } from "@/lib/format";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";

const KIND = {
  toko: { label: "Toko Fisik", cls: "bg-emerald-100 text-emerald-700" },
  online: { label: "Online (Cair)", cls: "bg-sky-100 text-sky-700" },
  pinjaman: { label: "Pinjaman", cls: "bg-violet-100 text-violet-700" },
  pembelian: { label: "Pembelian", cls: "bg-orange-100 text-orange-700" },
  pengeluaran: { label: "Pengeluaran", cls: "bg-red-100 text-red-700" },
};
const OUT = new Set(["pembelian", "pengeluaran"]);

export const CashDayDialog = ({ date, onClose }) => {
  const [items, setItems] = useState(null);
  useEffect(() => {
    if (!date) return;
    setItems(null);
    api.get(`/reports/cash/day?date=${date}`).then((r) => setItems(r.data.items));
  }, [date]);

  const net = (items || []).reduce((s, e) => s + (OUT.has(e.kind) ? -e.amount : e.amount), 0);

  return (
    <Dialog open={!!date} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl" data-testid="cash-day-dialog">
        <DialogHeader><DialogTitle>Detail Arus Kas – {fmtDate(date)}</DialogTitle></DialogHeader>
        {!items ? <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-[#1B5E3B]" /></div> : (
          <div className="max-h-[60vh] overflow-y-auto -mx-2 px-2">
            {items.length === 0 && <p className="py-8 text-center text-muted-foreground text-sm">Tidak ada transaksi.</p>}
            {items.map((e, i) => (
              <div key={i} className="flex items-center justify-between gap-3 py-2.5 border-b border-slate-100" data-testid={`cash-day-item-${i}`}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-[11px] px-2 py-0.5 rounded-md font-semibold shrink-0 ${KIND[e.kind].cls}`}>{KIND[e.kind].label}</span>
                    <span className="font-medium text-sm truncate">{e.title}</span>
                  </div>
                  {(e.desc || e.info) && <p className="text-xs text-muted-foreground mt-0.5 truncate">{[e.desc, e.info].filter(Boolean).join(" · ")}</p>}
                </div>
                <span className={`font-mono font-semibold text-sm whitespace-nowrap ${OUT.has(e.kind) ? "text-destructive" : "text-[#1B5E3B]"}`}>
                  {OUT.has(e.kind) ? `(${rupiah(e.amount)})` : rupiah(e.amount)}
                </span>
              </div>
            ))}
            {items.length > 0 && (
              <div className="flex justify-between pt-3 font-heading font-bold" data-testid="cash-day-net">
                <span>Bersih Hari Ini</span>
                <span className={`font-mono ${net < 0 ? "text-destructive" : "text-[#1B5E3B]"}`}>{rupiah(net)}</span>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
