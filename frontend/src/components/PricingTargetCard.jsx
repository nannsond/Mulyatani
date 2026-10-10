import { useEffect, useState } from "react";
import { api, apiError } from "@/lib/api";
import { usePricingTarget } from "@/lib/usePricingTarget";
import { TargetInput } from "@/components/SuggestPricePanel";
import { Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";

export default function PricingTargetCard() {
  const target = usePricingTarget();
  const [mode, setMode] = useState("percent");
  const [value, setValue] = useState(20);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (target.loaded) { setMode(target.mode); setValue(target.value); } }, [target]);

  const save = async () => {
    setSaving(true);
    try { await api.post("/pricing/settings", { mode, value: Number(value) || 0 }); toast.success("Target untung harga saran disimpan"); }
    catch (err) { toast.error(apiError(err.response?.data?.detail)); }
    finally { setSaving(false); }
  };

  return (
    <div className="bg-card rounded-2xl border border-slate-200 p-6" data-testid="pricing-target-card">
      <h3 className="font-heading font-semibold text-lg text-[#0F281E] mb-1 flex items-center gap-2"><Wand2 className="w-5 h-5 text-[#2563EB]" /> Target Untung Harga Saran</h3>
      <p className="text-sm text-muted-foreground mb-5">Dipakai untuk menghitung harga jual saran per platform, setelah dikurangi potongan tiap channel di bawah. Saran ini muncul di Daftar Harga dan Penjualan Online.</p>
      <div className="flex flex-wrap items-center gap-3">
        <TargetInput mode={mode} value={value} onMode={setMode} onValue={setValue} prefix="pricing-default" />
        <button onClick={save} disabled={saving} data-testid="pricing-target-save"
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#1B5E3B] text-white text-sm font-semibold hover:bg-[#143D2B] disabled:opacity-50">
          {saving && <Loader2 className="w-4 h-4 animate-spin" />} Simpan
        </button>
      </div>
    </div>
  );
}
