import { useState } from "react";
import { api } from "@/lib/api";
import { rupiah } from "@/lib/format";
import { suggestPrice, targetProfit } from "@/lib/fees";
import { X, Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";

export function TargetInput({ mode, value, onMode, onValue, prefix }) {
  return (
    <div className="flex gap-2">
      <select value={mode} onChange={(e) => onMode(e.target.value)} data-testid={`${prefix}-target-mode`} className="px-2 py-2 rounded-xl border border-input text-sm bg-white">
        <option value="percent">Untung % dari modal</option>
        <option value="fixed">Untung Rp / unit</option>
      </select>
      <input type="number" min="0" value={value} onChange={(e) => onValue(e.target.value)} data-testid={`${prefix}-target-value`}
        className="w-28 px-3 py-2 rounded-xl border border-input text-sm font-mono" />
    </div>
  );
}

export default function SuggestPricePanel({ products, channels, onClose, onApplied }) {
  const [mode, setMode] = useState("percent");
  const [value, setValue] = useState(20);
  const [picked, setPicked] = useState(channels.map((c) => c.name));
  const [saving, setSaving] = useState(false);
  const used = channels.filter((c) => picked.includes(c.name));
  const rows = products.map((p) => ({ p, prices: Object.fromEntries(used.map((c) => [c.name, suggestPrice(c.fees, p.harga_beli, targetProfit(p.harga_beli, mode, value))])) }));

  const apply = async () => {
    if (!used.length) { toast.error("Pilih minimal 1 platform"); return; }
    setSaving(true);
    let ok = 0;
    for (const { p, prices } of rows) {
      const { id, ...body } = p;
      try { await api.put(`/products/${id}`, { ...body, harga_channel: { ...(p.harga_channel || {}), ...prices } }); ok++; } catch { /* lanjut */ }
    }
    setSaving(false);
    toast.success(`Harga saran diterapkan ke ${ok} produk`);
    onApplied();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl w-full max-w-4xl p-6 max-h-[90vh] flex flex-col" data-testid="suggest-price-modal">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-heading font-bold text-lg flex items-center gap-2"><Wand2 className="w-5 h-5 text-[#2563EB]" /> Harga Jual Saran per Platform</h3>
          <button onClick={onClose} data-testid="suggest-price-close"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-xs text-muted-foreground mb-4">Harga dihitung agar setelah potongan tiap platform, untung bersih per unit tetap sesuai target (dibulatkan ke atas Rp100).</p>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <TargetInput mode={mode} value={value} onMode={setMode} onValue={setValue} prefix="suggest" />
          <div className="flex flex-wrap gap-2">
            {channels.map((c) => (
              <label key={c.name} className="flex items-center gap-1.5 text-sm px-2.5 py-1.5 rounded-lg border border-input cursor-pointer">
                <input type="checkbox" checked={picked.includes(c.name)} data-testid={`suggest-channel-${c.name.replace(/\s+/g, "-").toLowerCase()}`}
                  onChange={() => setPicked((x) => (x.includes(c.name) ? x.filter((n) => n !== c.name) : [...x, c.name]))} className="accent-[#2563EB]" />
                <span style={{ color: c.color }} className="font-semibold">{c.name}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="overflow-auto flex-1 border border-slate-200 rounded-xl">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-secondary">
              <tr className="text-left">
                <th className="px-3 py-2 font-semibold">Produk</th>
                <th className="px-3 py-2 font-semibold text-right">Modal</th>
                <th className="px-3 py-2 font-semibold text-right">Target Untung</th>
                {used.map((c) => <th key={c.name} className="px-3 py-2 font-semibold text-right" style={{ color: c.color }}>{c.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ p, prices }) => (
                <tr key={p.id} className="border-t border-slate-100" data-testid={`suggest-row-${p.id}`}>
                  <td className="px-3 py-2">{p.name}</td>
                  <td className="px-3 py-2 text-right font-mono">{rupiah(p.harga_beli)}</td>
                  <td className="px-3 py-2 text-right font-mono text-[#1B5E3B]">{rupiah(targetProfit(p.harga_beli, mode, value))}</td>
                  {used.map((c) => <td key={c.name} className="px-3 py-2 text-right font-mono font-semibold">{rupiah(prices[c.name])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button onClick={apply} disabled={saving || !used.length} data-testid="suggest-price-apply"
          className="mt-4 w-full flex items-center justify-center gap-2 bg-[#2563EB] text-white py-3 rounded-xl font-semibold hover:bg-[#1D4ED8] disabled:opacity-60">
          {saving && <Loader2 className="w-4 h-4 animate-spin" />} Terapkan ke {rows.length} Produk
        </button>
      </div>
    </div>
  );
}
