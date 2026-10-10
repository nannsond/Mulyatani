import { useEffect, useState } from "react";
import { api, apiError } from "@/lib/api";
import { Truck, Plus, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import PlatformLogisticsTable from "@/components/PlatformLogisticsTable";

const inputCls = "px-3 py-2 rounded-xl border border-input text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5E3B]";

export default function ShippingRatesCard() {
  const [rates, setRates] = useState([]);
  const [minKg, setMinKg] = useState(1);
  const [saving, setSaving] = useState(false);
  const [tables, setTables] = useState({});
  useEffect(() => { api.get("/shipping/rates").then(({ data }) => { setRates(data.rates); setMinKg(data.min_kg); setTables(data.platform_tables || {}); }); }, []);

  const update = (i, patch) => setRates(rates.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const save = async () => {
    setSaving(true);
    try {
      const { data } = await api.post("/shipping/rates", { min_kg: Number(minKg) || 0, rates: rates.map((r) => ({ daerah: r.daerah, tarif_per_kg: Number(r.tarif_per_kg) || 0 })) });
      setRates(data.rates); setMinKg(data.min_kg);
      toast.success("Tarif ongkir disimpan");
    } catch (err) { toast.error(apiError(err.response?.data?.detail)); }
    setSaving(false);
  };

  return (
    <div className="bg-card rounded-2xl border border-slate-200 p-6 space-y-4" data-testid="shipping-rates-card">
      <div>
        <h3 className="font-heading font-semibold text-lg text-[#0F281E] flex items-center gap-2"><Truck className="w-5 h-5 text-[#1B5E3B]" /> Tarif Ongkir per Daerah</h3>
        <p className="text-sm text-muted-foreground mt-1">Dipakai untuk estimasi ongkir channel tanpa tabel platform: berat total (dibulatkan ke atas per kg) × tarif daerah. Ongkir final diisi saat dana dari platform cair.</p>
      </div>
      <div className="space-y-2">
        {rates.length === 0 && <p className="text-sm text-muted-foreground">Belum ada tarif daerah.</p>}
        {rates.map((r, i) => (
          <div key={i} className="flex gap-2" data-testid={`shipping-rate-row-${i}`}>
            <input value={r.daerah} onChange={(e) => update(i, { daerah: e.target.value })} placeholder="Daerah (mis. Jawa Timur)" data-testid={`shipping-rate-daerah-${i}`} className={`${inputCls} flex-1 min-w-0`} />
            <input type="number" min="0" value={r.tarif_per_kg} onChange={(e) => update(i, { tarif_per_kg: e.target.value })} placeholder="Tarif/kg" data-testid={`shipping-rate-tarif-${i}`} className={`${inputCls} w-36`} />
            <button onClick={() => setRates(rates.filter((_, j) => j !== i))} data-testid={`shipping-rate-remove-${i}`} className="p-2 text-red-500 hover:bg-red-50 rounded-xl"><Trash2 className="w-4 h-4" /></button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => setRates([...rates, { daerah: "", tarif_per_kg: "" }])} data-testid="shipping-rate-add" className="flex items-center gap-1 px-3 py-2 rounded-xl border border-input text-sm hover:bg-secondary"><Plus className="w-4 h-4" /> Tambah Daerah</button>
        <label className="flex items-center gap-2 text-sm">Berat minimal
          <input type="number" min="0" step="0.1" value={minKg} onChange={(e) => setMinKg(e.target.value)} data-testid="shipping-min-kg" className={`${inputCls} w-20`} /> kg
        </label>
        <button onClick={save} disabled={saving} data-testid="shipping-rates-save" className="ml-auto flex items-center gap-2 px-4 py-2 rounded-xl bg-[#1B5E3B] text-white text-sm font-semibold hover:bg-[#143D2B] disabled:opacity-60">
          {saving && <Loader2 className="w-4 h-4 animate-spin" />} Simpan Tarif
        </button>
      </div>
      {Object.entries(tables).map(([ch, t]) => <PlatformLogisticsTable key={ch} channel={ch} table={t} />)}
    </div>
  );
}
