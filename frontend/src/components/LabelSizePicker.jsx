import { useState } from "react";

export const LABEL_SIZES = [
  { key: "4x2", label: "4 × 2 cm", w: 40, h: 20 },
  { key: "3x2", label: "3 × 2 cm", w: 30, h: 20 },
  { key: "3x1.5", label: "3 × 1,5 cm", w: 30, h: 15 },
  { key: "5x3", label: "5 × 3 cm", w: 50, h: 30 },
  { key: "custom", label: "Custom..." },
];
const KEY = "labelSize";
const clamp = (v, min, max) => Math.min(max, Math.max(min, Number(String(v).replace(",", ".")) || min));

export function loadLabelSize() {
  try { return JSON.parse(localStorage.getItem(KEY)) || { key: "4x2", w: 40, h: 20 }; } catch { return { key: "4x2", w: 40, h: 20 }; }
}

export default function LabelSizePicker({ size, setSize }) {
  const [cw, setCw] = useState(String(size.w / 10).replace(".", ","));
  const [ch, setCh] = useState(String(size.h / 10).replace(".", ","));
  const save = (v) => { setSize(v); localStorage.setItem(KEY, JSON.stringify(v)); };
  const applyCustom = (w = cw, h = ch) => save({ key: "custom", w: clamp(w, 2, 10) * 10, h: clamp(h, 1, 8) * 10 });
  const onSelect = (k) => {
    const o = LABEL_SIZES.find((x) => x.key === k);
    if (k === "custom") applyCustom(); else save({ key: k, w: o.w, h: o.h });
  };
  const inp = "w-14 px-2 py-1.5 rounded-lg border border-input bg-white text-xs text-center focus:outline-none focus:ring-2 focus:ring-[#1B5E3B]";
  return (
    <div className="flex items-center gap-1.5 text-xs" data-testid="label-size-picker">
      <span className="text-[#0F281E] font-semibold">Ukuran:</span>
      <select value={size.key} onChange={(e) => onSelect(e.target.value)} data-testid="label-size-select"
        className="px-2 py-1.5 rounded-lg border border-input bg-white text-xs focus:outline-none focus:ring-2 focus:ring-[#1B5E3B]">
        {LABEL_SIZES.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
      </select>
      {size.key === "custom" && (
        <>
          <input value={cw} onChange={(e) => setCw(e.target.value)} onBlur={() => applyCustom()} data-testid="label-custom-width" className={inp} title="Lebar (cm), 2–10" />
          <span>×</span>
          <input value={ch} onChange={(e) => setCh(e.target.value)} onBlur={() => applyCustom()} data-testid="label-custom-height" className={inp} title="Tinggi (cm), 1–8" />
          <span className="text-muted-foreground" data-testid="label-custom-applied">cm ({size.w / 10} × {size.h / 10})</span>
        </>
      )}
    </div>
  );
}
