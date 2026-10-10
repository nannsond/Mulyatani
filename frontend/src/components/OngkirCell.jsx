import { useState } from "react";
import { api, apiError } from "@/lib/api";
import { rupiah } from "@/lib/format";
import { Check, X } from "lucide-react";
import { toast } from "sonner";

export const estimateOngkir = (berat, rate, minKg) => {
  if (!rate || !(berat > 0)) return 0;
  return Math.ceil(Math.max(berat, Number(minKg) || 0)) * (Number(rate.tarif_per_kg) || 0);
};

const tierIndex = (berat) => (berat <= 1 ? 0 : Math.min(5, Math.ceil(berat - 1e-9) - 1));
export const routeLabel = (r) => `${r.zona_a} ↔ ${r.zona_b}`;

export function estimateFor(shipping, channel, sel, berat, hasItems) {
  const table = shipping.platform_tables?.[channel];
  if (table) {
    const svc = table.services.find((x) => x.name === sel.layanan);
    const route = svc?.routes.find((r) => routeLabel(r) === sel.rute);
    if (!route || !hasItems) return { fee: 0, label: "", table };
    const tier = tierIndex(berat);
    const fee = route.fees[tier];
    return { fee: fee || 0, na: fee == null, tier: table.tiers[tier], label: `${svc.name} · ${sel.rute}`, table };
  }
  const rate = shipping.rates.find((r) => r.daerah === sel.daerah);
  return { fee: estimateOngkir(berat, rate, shipping.min_kg), label: sel.daerah };
}

export function OngkirCell({ sale, isAdmin, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState("");
  const save = async () => {
    if (val === "" || Number(val) < 0) { toast.error("Isi ongkir final"); return; }
    try {
      await api.put(`/ecommerce/sales/${sale.id}/ongkir`, { ongkir: Number(val) });
      toast.success(`Ongkir final ${sale.ecom_no} disimpan`);
      setEditing(false); onSaved();
    } catch (err) { toast.error(apiError(err.response?.data?.detail)); }
  };
  if (editing) return (
    <div className="flex items-center justify-end gap-1">
      <input type="number" min="0" autoFocus value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()}
        data-testid={`ecom-ongkir-final-input-${sale.id}`} className="w-24 px-2 py-1 rounded-lg border border-input text-xs text-right" />
      <button onClick={save} data-testid={`ecom-ongkir-final-save-${sale.id}`} className="p-1 text-green-700 hover:bg-green-50 rounded"><Check className="w-4 h-4" /></button>
      <button onClick={() => setEditing(false)} className="p-1 text-slate-500 hover:bg-slate-100 rounded"><X className="w-4 h-4" /></button>
    </div>
  );
  const isFinal = sale.ongkir_final !== false;
  return (
    <div className="flex flex-col items-end gap-0.5" data-testid={`ecom-ongkir-${sale.id}`}>
      <span className="font-mono">{rupiah(sale.ongkir || 0)}</span>
      {isFinal ? <span className="text-[10px] font-semibold text-green-700">final</span> : (
        isAdmin ? (
          <button onClick={() => { setVal(String(sale.ongkir || "")); setEditing(true); }} data-testid={`ecom-ongkir-final-btn-${sale.id}`}
            className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 hover:bg-amber-200">estimasi · isi final</button>
        ) : <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">estimasi</span>
      )}
    </div>
  );
}
