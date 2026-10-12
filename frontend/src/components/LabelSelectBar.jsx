import { Tag, CheckSquare, X } from "lucide-react";
import LabelSizePicker from "@/components/LabelSizePicker";

const DAY = 86400000;
export const isPriceNew = (p, days = 7) => p.harga_jual_updated && Date.now() - new Date(p.harga_jual_updated).getTime() <= days * DAY;

export default function LabelSelectBar({ visible, selected, setSelected, size, setSize }) {
  const recent = visible.filter((p) => isPriceNew(p));
  const btn = "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors";
  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 rounded-xl bg-green-50 border border-green-200 text-sm" data-testid="label-select-bar">
      <Tag className="w-4 h-4 text-[#1B5E3B]" />
      <span className="text-[#0F281E]" data-testid="label-selected-count">
        {selected.size ? <><b>{selected.size}</b> produk dipilih untuk Label Rak</> : "Centang produk untuk mencetak label tertentu saja (tanpa centang = semua yang tampil)"}
      </span>
      <div className="flex flex-wrap items-center gap-2 ml-auto">
        <LabelSizePicker size={size} setSize={setSize} />
        <button onClick={() => setSelected(new Set(recent.map((p) => p.id)))} disabled={!recent.length} data-testid="label-select-recent"
          className={`${btn} border-[#1B5E3B] text-[#1B5E3B] bg-white hover:bg-green-100 disabled:opacity-40`}>
          <CheckSquare className="w-3.5 h-3.5" /> Harga berubah 7 hari ({recent.length})
        </button>
        {selected.size > 0 && (
          <button onClick={() => setSelected(new Set())} data-testid="label-select-clear" className={`${btn} border-input bg-white hover:bg-secondary`}>
            <X className="w-3.5 h-3.5" /> Batal pilih
          </button>
        )}
      </div>
    </div>
  );
}
