import { useState } from "react";
import { api, apiError } from "@/lib/api";
import { Plus, Trash2, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";

const slug = (n) => n.replace(/\s+/g, "-").toLowerCase();

export default function ChannelFeeEditor({ channel, defaults, onSaved }) {
  const [fees, setFees] = useState(channel.fees || []);
  const set = (i, patch) => setFees((f) => f.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  const s = slug(channel.name);

  const save = async () => {
    try {
      await api.put(`/channels/${encodeURIComponent(channel.name)}`, {
        fees: fees.map((f) => ({ label: f.label, type: f.type, value: Number(f.value) || 0, cap: Number(f.cap) || 0 })),
      });
      toast.success(`Potongan ${channel.name} disimpan`); onSaved();
    } catch (err) { toast.error(apiError(err.response?.data?.detail)); }
  };

  return (
    <div className="mt-2 p-3 rounded-xl bg-secondary/40 border border-dashed border-slate-300 space-y-2" data-testid={`fee-editor-${s}`}>
      <div className="grid grid-cols-12 gap-2 text-[11px] font-semibold text-muted-foreground px-1">
        <span className="col-span-4">Komponen potongan</span><span className="col-span-3">Jenis</span><span className="col-span-2">Nilai</span><span className="col-span-2">Maks (Rp)</span>
      </div>
      {fees.map((f, i) => (
        <div key={i} className="grid grid-cols-12 gap-2 items-center" data-testid={`fee-row-${s}-${i}`}>
          <input value={f.label} onChange={(e) => set(i, { label: e.target.value })} data-testid={`fee-label-${s}-${i}`} className="col-span-4 px-2 py-1.5 rounded-lg border border-input text-sm bg-white" />
          <select value={f.type} onChange={(e) => set(i, { type: e.target.value })} data-testid={`fee-type-${s}-${i}`} className="col-span-3 px-2 py-1.5 rounded-lg border border-input text-sm bg-white">
            <option value="percent">% omzet</option><option value="fixed">Rp / pesanan</option>
          </select>
          <input type="number" min="0" step="0.01" value={f.value} onChange={(e) => set(i, { value: e.target.value })} data-testid={`fee-value-${s}-${i}`} className="col-span-2 px-2 py-1.5 rounded-lg border border-input text-sm font-mono bg-white" />
          <input type="number" min="0" value={f.cap || ""} placeholder="-" onChange={(e) => set(i, { cap: e.target.value })} data-testid={`fee-cap-${s}-${i}`} className="col-span-2 px-2 py-1.5 rounded-lg border border-input text-sm font-mono bg-white" />
          <button onClick={() => setFees((x) => x.filter((_, k) => k !== i))} data-testid={`fee-remove-${s}-${i}`} className="col-span-1 text-destructive flex justify-center"><Trash2 className="w-4 h-4" /></button>
        </div>
      ))}
      <div className="flex flex-wrap gap-2 pt-1">
        <button onClick={() => setFees((x) => [...x, { label: "", type: "percent", value: 0, cap: 0 }])} data-testid={`fee-add-${s}`} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-input bg-white hover:bg-secondary"><Plus className="w-3.5 h-3.5" /> Komponen</button>
        {defaults?.length > 0 && (
          <button onClick={() => setFees(defaults.map((d) => ({ ...d })))} data-testid={`fee-reset-${s}`} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-input bg-white hover:bg-secondary"><RotateCcw className="w-3.5 h-3.5" /> Reset ke referensi {channel.name}</button>
        )}
        <button onClick={save} data-testid={`fee-save-${s}`} className="ml-auto flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-[#1B5E3B] text-white font-semibold hover:bg-[#143D2B]"><Save className="w-3.5 h-3.5" /> Simpan Potongan</button>
      </div>
    </div>
  );
}
