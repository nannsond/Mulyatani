import { useEffect, useState } from "react";
import { api, apiError } from "@/lib/api";
import { usePricingTarget } from "@/lib/usePricingTarget";
import { PRICING_CATEGORIES } from "@/lib/fees";
import { TargetInput } from "@/components/SuggestPricePanel";
import { Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";

const slug = (s) => s.replace(/\s+/g, "-").toLowerCase();

export default function PricingTargetCard() {
  const target = usePricingTarget();
  const [mode, setMode] = useState("percent");
  const [value, setValue] = useState(20);
  const [cats, setCats] = useState({});
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (target.loaded) { setMode(target.mode); setValue(target.value); setCats(target.categories || {}); } }, [target]);

  const toggleCat = (c) => setCats((x) => {
    const n = { ...x };
    if (n[c]) delete n[c]; else n[c] = { mode, value };
    return n;
  });
  const setCat = (c, patch) => setCats((x) => ({ ...x, [c]: { ...x[c], ...patch } }));

  const save = async () => {
    setSaving(true);
    const categories = Object.fromEntries(Object.entries(cats).map(([k, v]) => [k, { mode: v.mode, value: Number(v.value) || 0 }]));
    try { await api.post("/pricing/settings", { mode, value: Number(value) || 0, categories }); toast.success("Target untung harga saran disimpan"); }
    catch (err) { toast.error(apiError(err.response?.data?.detail)); }
    finally { setSaving(false); }
  };

  return (
    <div className="bg-card rounded-2xl border border-slate-200 p-6" data-testid="pricing-target-card">
      <h3 className="font-heading font-semibold text-lg text-[#0F281E] mb-1 flex items-center gap-2"><Wand2 className="w-5 h-5 text-[#2563EB]" /> Target Untung Harga Saran</h3>
      <p className="text-sm text-muted-foreground mb-5">Dipakai untuk menghitung harga jual saran per platform, setelah dikurangi potongan tiap channel di atas. Saran ini muncul di Daftar Harga, Paket Bundling, Penjualan Online, dan Dashboard.</p>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium w-28">Default</span>
        <TargetInput mode={mode} value={value} onMode={setMode} onValue={setValue} prefix="pricing-default" />
      </div>
      <p className="text-sm font-medium mt-5 mb-2">Target khusus per kategori <span className="text-xs text-muted-foreground font-normal">(tidak dicentang = pakai default)</span></p>
      <div className="space-y-2">
        {PRICING_CATEGORIES.map((c) => (
          <div key={c} className="flex flex-wrap items-center gap-3" data-testid={`pricing-cat-row-${slug(c)}`}>
            <label className="flex items-center gap-2 text-sm w-28 cursor-pointer">
              <input type="checkbox" checked={!!cats[c]} onChange={() => toggleCat(c)} data-testid={`pricing-cat-toggle-${slug(c)}`} className="accent-[#1B5E3B]" />
              {c === "Paket" ? "Paket Bundling" : c}
            </label>
            {cats[c] ? (
              <TargetInput mode={cats[c].mode} value={cats[c].value} onMode={(m) => setCat(c, { mode: m })} onValue={(v) => setCat(c, { value: v })} prefix={`pricing-cat-${slug(c)}`} />
            ) : <span className="text-xs text-muted-foreground">Pakai default</span>}
          </div>
        ))}
      </div>
      <button onClick={save} disabled={saving} data-testid="pricing-target-save"
        className="mt-5 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#1B5E3B] text-white text-sm font-semibold hover:bg-[#143D2B] disabled:opacity-50">
        {saving && <Loader2 className="w-4 h-4 animate-spin" />} Simpan
      </button>
    </div>
  );
}
