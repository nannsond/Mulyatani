import { useState } from "react";
import { api, apiError } from "@/lib/api";
import { rupiah } from "@/lib/format";
import { X, Loader2 } from "lucide-react";
import { toast } from "sonner";

const inputCls = "mt-1 w-full px-3 py-2 rounded-xl border border-input text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5E3B]";

export default function EcomEditDialog({ sale, channels, onClose, onSaved }) {
  const [f, setF] = useState({
    channel: sale.channel, date: (sale.created_at || "").slice(0, 10), order_no: sale.order_no || "", customer_name: sale.customer_name || "",
    admin_fee: sale.admin_fee || 0, ongkir: sale.ongkir || 0, biaya_lain: sale.biaya_lain || 0,
    items: (sale.items || []).map((i) => ({ name: i.name, qty: i.qty, harga: i.harga })),
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const setItem = (idx, k, v) => setF((x) => ({ ...x, items: x.items.map((it, j) => (j === idx ? { ...it, [k]: v } : it)) }));
  const omzet = f.items.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.harga) || 0), 0);
  const biaya = (Number(f.admin_fee) || 0) + (Number(f.ongkir) || 0) + (Number(f.biaya_lain) || 0);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put(`/ecommerce/sales/${sale.id}`, {
        ...f, admin_fee: Number(f.admin_fee) || 0, ongkir: Number(f.ongkir) || 0, biaya_lain: Number(f.biaya_lain) || 0,
        items: f.items.map((i) => ({ qty: Number(i.qty) || 0, harga: Number(i.harga) || 0 })),
      });
      toast.success(`Penjualan ${sale.ecom_no} diperbarui`);
      onSaved();
    } catch (err) { toast.error(apiError(err.response?.data?.detail)); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <form onSubmit={save} className="relative bg-white rounded-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto space-y-3" data-testid="ecom-edit-modal">
        <div className="flex items-center justify-between">
          <h3 className="font-heading font-bold text-lg">Edit Penjualan <span className="font-mono text-sm text-muted-foreground">{sale.ecom_no}</span></h3>
          <button type="button" onClick={onClose} data-testid="ecom-edit-close"><X className="w-5 h-5" /></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-medium">Channel
            <select value={f.channel} onChange={(e) => set("channel", e.target.value)} data-testid="ecom-edit-channel" className={`${inputCls} bg-white`}>
              {channels.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium">Tanggal
            <input type="date" value={f.date} onChange={(e) => set("date", e.target.value)} required data-testid="ecom-edit-date" className={inputCls} />
          </label>
          <label className="text-sm font-medium">No. Pesanan
            <input value={f.order_no} onChange={(e) => set("order_no", e.target.value)} data-testid="ecom-edit-order-no" className={inputCls} />
          </label>
          <label className="text-sm font-medium">Nama Pembeli
            <input value={f.customer_name} onChange={(e) => set("customer_name", e.target.value)} data-testid="ecom-edit-customer" className={inputCls} />
          </label>
        </div>
        <div className="rounded-xl border border-slate-200 p-3 space-y-2">
          <p className="text-sm font-medium">Item <span className="text-xs text-muted-foreground font-normal">(ubah qty akan menyesuaikan stok)</span></p>
          {f.items.map((it, idx) => (
            <div key={idx} className="flex items-center gap-2" data-testid={`ecom-edit-item-${idx}`}>
              <span className="flex-1 min-w-0 truncate text-sm">{it.name}</span>
              <input type="number" min="1" value={it.qty} onChange={(e) => setItem(idx, "qty", e.target.value)} data-testid={`ecom-edit-qty-${idx}`} className="w-16 px-2 py-1.5 rounded-lg border border-input text-sm text-center" />
              <input type="number" min="0" value={it.harga} onChange={(e) => setItem(idx, "harga", e.target.value)} data-testid={`ecom-edit-harga-${idx}`} className="w-28 px-2 py-1.5 rounded-lg border border-input text-sm font-mono text-right" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[["admin_fee", "Biaya Admin"], ["ongkir", "Ongkir"], ["biaya_lain", "Biaya Lain"]].map(([k, l]) => (
            <label key={k} className="text-sm font-medium">{l}
              <input type="number" min="0" value={f[k]} onChange={(e) => set(k, e.target.value)} data-testid={`ecom-edit-${k.replace("_", "-")}`} className={`${inputCls} font-mono`} />
            </label>
          ))}
        </div>
        <div className="text-sm space-y-1 rounded-xl bg-secondary/40 p-3">
          <div className="flex justify-between"><span>Omzet</span><span className="font-mono" data-testid="ecom-edit-omzet">{rupiah(omzet)}</span></div>
          <div className="flex justify-between text-destructive"><span>Total biaya</span><span className="font-mono">-{rupiah(biaya)}</span></div>
        </div>
        <button type="submit" disabled={saving} data-testid="ecom-edit-save" className="w-full flex items-center justify-center gap-2 bg-[#1B5E3B] text-white py-3 rounded-xl font-semibold hover:bg-[#143D2B] disabled:opacity-60">
          {saving && <Loader2 className="w-4 h-4 animate-spin" />} Simpan Perubahan
        </button>
      </form>
    </div>
  );
}
