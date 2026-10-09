import { useEffect, useState } from "react";
import { api, apiError } from "@/lib/api";
import { rupiah } from "@/lib/format";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, X, Boxes, AlertTriangle, PackageMinus, Loader2 } from "lucide-react";

const EMPTY = { name: "", category: "Paket", harga_jual: 0, components: [] };

export default function BundlingPanel({ isAdmin, onChanged }) {
  const [bundles, setBundles] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);

  const load = () => {
    setLoading(true);
    return Promise.all([api.get("/bundles"), api.get("/products")]).then(([b, p]) => {
      setBundles(b.data); setProducts(p.data); setLoading(false);
    });
  };
  useEffect(() => { load(); }, []);

  const pName = (id) => products.find((p) => p.id === id)?.name || "";

  const addComp = (modalState, pid) => {
    const p = products.find((x) => x.id === pid);
    if (!p) return modalState;
    if (modalState.components.some((c) => c.product_id === pid)) return modalState;
    return { ...modalState, components: [...modalState.components, { product_id: p.id, name: p.name, qty: 1 }] };
  };

  const save = async (e) => {
    e.preventDefault();
    if (!modal.name.trim()) { toast.error("Nama paket wajib diisi"); return; }
    if (modal.components.length === 0) { toast.error("Tambahkan minimal 1 komponen"); return; }
    const body = {
      name: modal.name, category: modal.category || "Paket", harga_jual: Number(modal.harga_jual) || 0,
      components: modal.components.map((c) => ({ product_id: c.product_id, name: pName(c.product_id), qty: Number(c.qty) || 1 })),
    };
    try {
      if (modal.id) await api.put(`/bundles/${modal.id}`, body);
      else await api.post("/bundles", body);
      toast.success("Paket disimpan");
      setModal(null); load(); onChanged?.();
    } catch (err) { toast.error(apiError(err.response?.data?.detail)); }
  };

  const del = async (b) => {
    if (!window.confirm(`Hapus paket "${b.name}"?`)) return;
    try { await api.delete(`/bundles/${b.id}`); toast.success("Paket dihapus"); load(); }
    catch (err) { toast.error(apiError(err.response?.data?.detail)); }
  };

  const reduce = async (b) => {
    const qtyStr = window.prompt(`Kurangi stok paket "${b.name}" (tersedia ${b.stok}). Masukkan jumlah paket terjual/terpakai:`, "1");
    if (qtyStr === null) return;
    const qty = Number(qtyStr);
    if (!qty || qty <= 0) { toast.error("Jumlah tidak valid"); return; }
    try {
      await api.post(`/bundles/${b.id}/reduce`, { qty });
      toast.success(`Stok ${qty} paket dikurangi, komponen terpotong`);
      load(); onChanged?.();
    } catch (err) { toast.error(apiError(err.response?.data?.detail)); }
  };

  const openEdit = (b) => setModal({
    id: b.id, name: b.name, category: b.category || "Paket", harga_jual: b.harga_jual,
    components: b.components.map((c) => ({ product_id: c.product_id, name: c.name, qty: c.qty })),
  });

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-[#1B5E3B]" /></div>;

  return (
    <div className="space-y-4" data-testid="bundling-panel">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Stok paket dihitung otomatis dari ketersediaan produk satuan penyusunnya.</p>
        {isAdmin && (
          <button onClick={() => setModal({ ...EMPTY })} data-testid="bundle-add-trigger"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0F281E] text-white text-sm font-semibold hover:bg-[#143D2B]"><Plus className="w-4 h-4" /> Tambah Paket</button>
        )}
      </div>

      {bundles.length === 0 ? (
        <div className="bg-card rounded-2xl border border-slate-200 p-10 text-center text-muted-foreground" data-testid="bundle-empty">
          <Boxes className="w-10 h-10 mx-auto mb-3 opacity-40" />
          Belum ada paket bundling. {isAdmin && "Klik \"Tambah Paket\" untuk membuat."}
        </div>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {bundles.map((b) => {
            const anyHabis = b.components.some((c) => c.habis || c.missing);
            return (
              <div key={b.id} className="bg-card rounded-2xl border border-slate-200 p-5 flex flex-col" data-testid={`bundle-card-${b.id}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-[#2563EB]">★ Paket Bundling</span>
                    <h3 className="font-heading font-bold text-[#0F281E] leading-tight">{b.name}</h3>
                  </div>
                  <span data-testid={`bundle-stock-${b.id}`}
                    className={`shrink-0 text-xs font-bold px-2.5 py-1 rounded-full ${b.stok <= 0 ? "bg-destructive text-white" : b.stok <= 3 ? "bg-amber-100 text-amber-700 border border-amber-300" : "bg-green-100 text-green-700"}`}>
                    Stok: {b.stok}
                  </span>
                </div>

                <p className="font-mono font-bold text-[#1B5E3B] mt-1">{rupiah(b.harga_jual)}</p>

                <div className="mt-3 space-y-1.5 flex-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Komposisi</p>
                  {b.components.map((c, idx) => (
                    <div key={idx} className="flex items-center justify-between text-sm" data-testid={`bundle-comp-${b.id}-${idx}`}>
                      <span className="truncate">{c.qty}× {c.name}{c.missing && <span className="text-destructive"> (produk hilang)</span>}</span>
                      <span className={`font-mono text-xs shrink-0 ml-2 ${c.habis || c.missing ? "text-destructive font-bold" : "text-muted-foreground"}`}>
                        stok {c.stok}{(c.habis || c.missing) ? " · habis" : ""}
                      </span>
                    </div>
                  ))}
                </div>

                {anyHabis && (
                  <div className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-destructive bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5" data-testid={`bundle-warning-${b.id}`}>
                    <AlertTriangle className="w-3.5 h-3.5" /> Ada komponen habis — paket tidak bisa dijual
                  </div>
                )}

                {isAdmin && (
                  <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2">
                    <button onClick={() => reduce(b)} disabled={b.stok <= 0} data-testid={`bundle-reduce-${b.id}`}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#C85A32] text-white text-xs font-semibold hover:bg-[#B04B26] disabled:opacity-40"><PackageMinus className="w-3.5 h-3.5" /> Kurangi Stok</button>
                    <button onClick={() => openEdit(b)} data-testid={`bundle-edit-${b.id}`} className="w-9 h-9 rounded-lg border border-input flex items-center justify-center hover:bg-secondary"><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => del(b)} data-testid={`bundle-delete-${b.id}`} className="w-9 h-9 rounded-lg text-destructive hover:bg-red-50 flex items-center justify-center"><Trash2 className="w-4 h-4" /></button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setModal(null)} />
          <form onSubmit={save} className="relative bg-white rounded-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" data-testid="bundle-modal">
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
                <label className="text-sm font-medium">Harga Jual Paket (Rp)</label>
                <input type="number" min="0" value={modal.harga_jual} onChange={(e) => setModal({ ...modal, harga_jual: e.target.value })} data-testid="bundle-harga-input"
                  className="mt-1 w-full px-3 py-2.5 rounded-xl border border-input text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#1B5E3B]" />
              </div>

              <div>
                <label className="text-sm font-medium">Komponen (Produk Satuan)</label>
                <div className="mt-1 space-y-2">
                  {modal.components.map((c, idx) => (
                    <div key={idx} className="flex items-center gap-2" data-testid={`bundle-comp-row-${idx}`}>
                      <span className="flex-1 min-w-0 truncate text-sm">{pName(c.product_id) || c.name}</span>
                      <input type="number" min="1" value={c.qty} data-testid={`bundle-comp-qty-${idx}`}
                        onChange={(e) => setModal((m) => ({ ...m, components: m.components.map((it, k) => k === idx ? { ...it, qty: e.target.value } : it) }))}
                        className="w-16 px-2 py-1.5 rounded-lg border border-input text-sm text-center" />
                      <button type="button" onClick={() => setModal((m) => ({ ...m, components: m.components.filter((_, k) => k !== idx) }))} data-testid={`bundle-comp-remove-${idx}`} className="text-destructive shrink-0"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <Plus className="w-4 h-4 text-muted-foreground" />
                  <select onChange={(e) => { if (e.target.value) { setModal((m) => addComp(m, e.target.value)); e.target.value = ""; } }} data-testid="bundle-add-comp-select"
                    className="flex-1 px-3 py-2 rounded-lg border border-input text-sm bg-white">
                    <option value="">+ Tambah produk satuan...</option>
                    {products.map((p) => <option key={p.id} value={p.id}>{p.name} (stok {p.stok})</option>)}
                  </select>
                </div>
              </div>
            </div>

            <button type="submit" data-testid="bundle-save-button"
              className="mt-5 w-full bg-[#1B5E3B] text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-[#143D2B]">Simpan Paket</button>
          </form>
        </div>
      )}
    </div>
  );
}
