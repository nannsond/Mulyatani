import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { rupiah } from "@/lib/format";

const inputCls = "px-2 py-1.5 rounded-lg border border-input text-sm";
const clean = (items) => items.filter((b) => b.keterangan.trim() || b.jumlah);

const ItemRows = ({ title, items, setItems, prefix, hint, addLabel }) => {
  const setB = (i, k, v) => setItems((b) => b.map((x, j) => (j === i ? { ...x, [k]: k === "jumlah" ? Number(v) || 0 : v } : x)));
  const total = items.reduce((s, b) => s + (Number(b.jumlah) || 0), 0);
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold">{title}</p>
        <button onClick={() => setItems((b) => [...b, { keterangan: "", jumlah: 0 }])} data-testid={`payroll-${prefix}-add`}
          className="flex items-center gap-1 text-xs font-semibold text-[#1B5E3B] hover:underline"><Plus className="w-3.5 h-3.5" /> {addLabel}</button>
      </div>
      {items.length === 0 && <p className="text-xs text-muted-foreground">{hint}</p>}
      <div className="space-y-2">
        {items.map((b, i) => (
          <div key={i} className="flex gap-2">
            <input value={b.keterangan} onChange={(e) => setB(i, "keterangan", e.target.value)} data-testid={`payroll-${prefix}-ket-${i}`} placeholder="Keterangan" className={`${inputCls} flex-1`} />
            <input type="number" value={b.jumlah || ""} onChange={(e) => setB(i, "jumlah", e.target.value)} data-testid={`payroll-${prefix}-jumlah-${i}`} placeholder="Jumlah" className={`${inputCls} w-32 text-right font-mono`} />
            <button onClick={() => setItems((x) => x.filter((_, j) => j !== i))} data-testid={`payroll-${prefix}-remove-${i}`} className="p-1.5 rounded-lg border border-input text-destructive hover:bg-secondary"><Trash2 className="w-4 h-4" /></button>
          </div>
        ))}
      </div>
      {items.length > 0 && <p className="text-xs text-right text-muted-foreground mt-1">Total: <span className="font-mono" data-testid={`payroll-${prefix}-total`}>{rupiah(total)}</span></p>}
    </div>
  );
};

export const PayrollDetailDialog = ({ open, onOpenChange, row, value, onApply }) => {
  const [bonus, setBonus] = useState([]);
  const [potongan, setPotongan] = useState([]);

  useEffect(() => {
    if (!open) return;
    setBonus((value?.bonus_items || []).map((b) => ({ ...b })));
    setPotongan((value?.potongan_items || []).map((b) => ({ ...b })));
  }, [open, value]);

  const apply = () => {
    const potongan_items = clean(potongan);
    onApply({ bonus_items: clean(bonus), potongan_items, potongan_lain: potongan_items.reduce((s, p) => s + (Number(p.jumlah) || 0), 0) });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="payroll-detail-dialog">
        <DialogHeader><DialogTitle>Rincian Slip — {row?.user_name}</DialogTitle></DialogHeader>
        <div className="space-y-5">
          <ItemRows title="Bonus Tambahan" items={bonus} setItems={setBonus} prefix="bonus" addLabel="Tambah bonus" hint="Contoh: Angkat Pupuk (7/10) 152 sak." />
          <ItemRows title="Potongan Lain-lain" items={potongan} setItems={setPotongan} prefix="potlain" addLabel="Tambah potongan" hint="Contoh: Kasbon, barang rusak." />
        </div>
        <DialogFooter>
          <button onClick={apply} data-testid="payroll-detail-apply" className="px-4 py-2 rounded-xl bg-[#1B5E3B] text-white text-sm font-semibold hover:bg-[#143D2B]">Terapkan</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
