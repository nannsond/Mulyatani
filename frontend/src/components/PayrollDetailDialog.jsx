import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { rupiah } from "@/lib/format";

const inputCls = "px-2 py-1.5 rounded-lg border border-input text-sm";

export const PayrollDetailDialog = ({ open, onOpenChange, row, value, onApply }) => {
  const [bonus, setBonus] = useState([]);
  const [potLain, setPotLain] = useState("");
  const [potKet, setPotKet] = useState("");

  useEffect(() => {
    if (!open) return;
    setBonus((value?.bonus_items || []).map((b) => ({ ...b })));
    setPotLain(value?.potongan_lain ? String(value.potongan_lain) : "");
    setPotKet(value?.potongan_lain_ket || "");
  }, [open, value]);

  const setB = (i, k, v) => setBonus((b) => b.map((x, j) => (j === i ? { ...x, [k]: k === "jumlah" ? Number(v) || 0 : v } : x)));
  const apply = () => {
    onApply({ bonus_items: bonus.filter((b) => b.keterangan.trim() || b.jumlah), potongan_lain: Number(potLain) || 0, potongan_lain_ket: potKet });
    onOpenChange(false);
  };
  const totalBonus = bonus.reduce((s, b) => s + (Number(b.jumlah) || 0), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="payroll-detail-dialog">
        <DialogHeader><DialogTitle>Rincian Slip — {row?.user_name}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold">Bonus Tambahan</p>
              <button onClick={() => setBonus((b) => [...b, { keterangan: "", jumlah: 0 }])} data-testid="payroll-bonus-add"
                className="flex items-center gap-1 text-xs font-semibold text-[#1B5E3B] hover:underline"><Plus className="w-3.5 h-3.5" /> Tambah bonus</button>
            </div>
            {bonus.length === 0 && <p className="text-xs text-muted-foreground">Contoh: Angkat Pupuk (7/10) 152 sak.</p>}
            <div className="space-y-2">
              {bonus.map((b, i) => (
                <div key={i} className="flex gap-2">
                  <input value={b.keterangan} onChange={(e) => setB(i, "keterangan", e.target.value)} data-testid={`payroll-bonus-ket-${i}`} placeholder="Keterangan" className={`${inputCls} flex-1`} />
                  <input type="number" value={b.jumlah || ""} onChange={(e) => setB(i, "jumlah", e.target.value)} data-testid={`payroll-bonus-jumlah-${i}`} placeholder="Jumlah" className={`${inputCls} w-32 text-right font-mono`} />
                  <button onClick={() => setBonus((x) => x.filter((_, j) => j !== i))} data-testid={`payroll-bonus-remove-${i}`} className="p-1.5 rounded-lg border border-input text-destructive hover:bg-secondary"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
            {bonus.length > 0 && <p className="text-xs text-right text-muted-foreground mt-1">Total bonus: <span className="font-mono">{rupiah(totalBonus)}</span></p>}
          </div>
          <div>
            <p className="text-sm font-semibold mb-2">Potongan Lain-lain</p>
            <div className="flex gap-2">
              <input value={potKet} onChange={(e) => setPotKet(e.target.value)} data-testid="payroll-potlain-ket" placeholder="Keterangan (mis. kasbon)" className={`${inputCls} flex-1`} />
              <input type="number" value={potLain} onChange={(e) => setPotLain(e.target.value)} data-testid="payroll-potlain-jumlah" placeholder="Jumlah" className={`${inputCls} w-32 text-right font-mono`} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <button onClick={apply} data-testid="payroll-detail-apply" className="px-4 py-2 rounded-xl bg-[#1B5E3B] text-white text-sm font-semibold hover:bg-[#143D2B]">Terapkan</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
