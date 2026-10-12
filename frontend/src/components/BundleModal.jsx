import { rupiah } from "@/lib/format";
import { Trash2, X } from "lucide-react";
import ProductSearchPicker from "@/components/ProductSearchPicker";

const slug = (s) => s.replace(/\s+/g, "-").toLowerCase();
const inputCls = "mt-1 w-full px-3 py-2.5 rounded-xl border border-input text-sm font-mono focus:outline-none focus:ring-2";

export default function BundleModal({ modal, setModal, products, channels, onSubmit }) {
  const pOf = (id) => products.find((p) => p.id === id);
  const cost = modal.components.reduce((t, c) => t + (Number(c.qty) || 1) * (pOf(c.product_id)?.harga_beli || 0), 0);
  const addComp = (pid) => setModal((m) => {
    const p = pOf(pid);
    if (!p || m.components.some((c) => c.product_id === pid)) return m;
    return { ...m, components: [...m.components, { product_id: p.id, name: p.name, qty: 1 }] };
  });
  const setComp = (idx, patch) => setModal((m) => ({ ...m, components: m.components.map((it, k) => (k === idx ? { ...it, ...patch } : it)) }));
  const field = (key, label, ring, testid) => (
    <div>
      <label className="text-sm font-medium">{label}</label>
      <input type="number" min="0" value={modal[key]} onChange={(e) => setModal({ ...modal, [key]: e.target.value })} data-testid={testid} className={`${inputCls} ${ring}`} />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={() => setModal(null)} />
      <form onSubmit={onSubmit} className="relative bg-white rounded-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" data-testid="bundle-modal">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-heading font-bold text-lg">{modal.id ? "Edit Paket" : "Tambah Paket Bundling"}</h3>
          <button type="button" onClick={() => setModal(null)}><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium">Nama Paket</label>
            <input value={modal.name} onChange={(e) => setModal({ ...modal, name: e.target.value })} data-testid="bundle-name-input"
              placeholder="mis. Paket Hemat Tani" className="mt-1 w-full px-3 py-2.5 rounded-xl border border-input text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5E3B]" />
          </div>
          <div>
            <label className="text-sm font-medium">Komponen (Produk Satuan)</label>
            <div className="mt-1 space-y-2">
              {modal.components.map((c, idx) => (
                <div key={idx} className="flex items-center gap-2" data-testid={`bundle-comp-row-${idx}`}>
                  <span className="flex-1 min-w-0 truncate text-sm">{pOf(c.product_id)?.name || c.name}</span>
                  <input type="number" min="1" value={c.qty} data-testid={`bundle-comp-qty-${idx}`} onChange={(e) => setComp(idx, { qty: e.target.value })}
                    className="w-16 px-2 py-1.5 rounded-lg border border-input text-sm text-center" />
                  <button type="button" onClick={() => setModal((m) => ({ ...m, components: m.components.filter((_, k) => k !== idx) }))} data-testid={`bundle-comp-remove-${idx}`} className="text-destructive shrink-0"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
            <ProductSearchPicker products={products} excludeIds={modal.components.map((c) => c.product_id)} onPick={addComp} />
            <p className="text-xs text-muted-foreground mt-2" data-testid="bundle-modal-cost">Modal paket (total harga beli komponen): <span className="font-mono font-semibold text-foreground">{rupiah(cost)}</span></p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {field("harga_jual", "Harga Normal", "focus:ring-[#1B5E3B]", "bundle-harga-input")}
            {field("harga_reseller", "Harga Reseller", "focus:ring-[#C85A32]", "bundle-reseller-input")}
          </div>
          {channels.length > 0 && (
            <div className="rounded-xl border border-dashed border-[#2563EB]/40 p-3">
              <p className="text-sm font-medium">Harga per Platform</p>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {channels.map((c) => (
                  <div key={c.name}>
                    <label className="text-xs font-semibold" style={{ color: c.color }}>{c.name}</label>
                    <input type="number" min="0" value={modal.harga_channel?.[c.name] ?? ""} placeholder="0"
                      onChange={(e) => setModal({ ...modal, harga_channel: { ...(modal.harga_channel || {}), [c.name]: e.target.value } })}
                      data-testid={`bundle-channel-price-${slug(c.name)}`}
                      className="mt-1 w-full px-3 py-2 rounded-xl border border-input text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <button type="submit" data-testid="bundle-save-button"
          className="mt-5 w-full bg-[#1B5E3B] text-white py-3 rounded-xl font-semibold hover:bg-[#143D2B]">Simpan Paket</button>
      </form>
    </div>
  );
}
