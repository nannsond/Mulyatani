import { useEffect, useState } from "react";
import { api, apiError } from "@/lib/api";
import { rupiah } from "@/lib/format";
import { calcFees } from "@/lib/fees";
import { exportPDF, exportExcel, exportBundleTemplate, readBundleExcel } from "@/lib/exporter";
import ExcelImport from "@/components/ExcelImport";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Boxes, AlertTriangle, PackageMinus, Loader2, Search, FileDown, FileSpreadsheet } from "lucide-react";
import BundleModal from "@/components/BundleModal";
import PriceCell from "@/components/PriceCell";

const EMPTY = { name: "", category: "Paket", harga_jual: 0, harga_reseller: 0, harga_channel: {}, components: [] };
const slug = (s) => s.replace(/\s+/g, "-").toLowerCase();

export default function BundlingPanel({ isAdmin, onChanged, channels = [] }) {
  const [bundles, setBundles] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("name");

  const load = () => Promise.all([api.get("/bundles"), api.get("/products")]).then(([b, p]) => { setBundles(b.data); setProducts(p.data); setLoading(false); });
  useEffect(() => { load(); }, []);

  const save = async (e) => {
    e.preventDefault();
    if (!modal.name.trim()) { toast.error("Nama paket wajib diisi"); return; }
    if (modal.components.length === 0) { toast.error("Tambahkan minimal 1 komponen"); return; }
    const body = {
      name: modal.name, category: modal.category || "Paket", harga_jual: Number(modal.harga_jual) || 0,
      harga_reseller: Number(modal.harga_reseller) || 0,
      harga_channel: Object.fromEntries(Object.entries(modal.harga_channel || {}).map(([k, v]) => [k, Number(v)]).filter(([, v]) => v > 0)),
      components: modal.components.map((c) => ({ product_id: c.product_id, name: products.find((p) => p.id === c.product_id)?.name || c.name, qty: Number(c.qty) || 1 })),
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

  const setPrice = (b, field, value, channel) => api.patch(`/bundles/${b.id}/price`, { field, value, channel }).then(load);

  const openEdit = (b) => setModal({
    id: b.id, name: b.name, category: b.category || "Paket", harga_jual: b.harga_jual, harga_reseller: b.harga_reseller || 0,
    harga_channel: b.harga_channel || {},
    components: b.components.map((c) => ({ product_id: c.product_id, name: c.name, qty: c.qty })),
  });

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-[#1B5E3B]" /></div>;

  const sorted = bundles.filter((b) => b.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (sortBy === "name_desc" ? b.name.localeCompare(a.name, "id") : a.name.localeCompare(b.name, "id")));
  const cols = ["Nama Paket", "Komposisi", "Modal", "Harga Normal", "Harga Reseller", ...channels.map((c) => c.name), "Stok"];
  const rows = sorted.map((b) => [b.name, b.components.map((c) => `${c.qty}x ${c.name}`).join(", "), b.hpp, b.harga_jual || 0, b.harga_reseller || 0, ...channels.map((c) => b.harga_channel?.[c.name] || 0), b.stok]);
  const exportTitle = "Daftar Harga Paket";

  return (
    <div className="space-y-5" data-testid="bundling-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} data-testid="bundle-search-input" placeholder="Cari paket..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5E3B]" />
        </div>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} data-testid="bundle-sort-select"
          className="px-3 py-2.5 rounded-xl border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5E3B]">
          <option value="name">Urutkan: Nama A-Z</option>
          <option value="name_desc">Urutkan: Nama Z-A</option>
        </select>
        <div className="flex gap-2">
          <button onClick={() => exportPDF({ title: exportTitle, columns: cols, rows })} data-testid="bundle-export-pdf"
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-input text-sm hover:bg-secondary"><FileDown className="w-4 h-4" /> PDF</button>
          <button onClick={() => exportExcel({ filename: exportTitle.replace(/\s+/g, "_"), sheetName: "Paket", columns: cols, rows })} data-testid="bundle-export-excel"
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-input text-sm hover:bg-secondary"><FileSpreadsheet className="w-4 h-4" /> Excel</button>
          {isAdmin && <ExcelImport title="paket" endpoint="/bundles/bulk" testid="bundle" onDone={() => { load(); onChanged?.(); }}
            parse={async (f) => ({ bundles: await readBundleExcel(f) })} onTemplate={() => exportBundleTemplate(channels.map((c) => c.name))} />}
          {isAdmin && (
            <button onClick={() => setModal({ ...EMPTY })} data-testid="bundle-add-trigger"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#1B5E3B] text-white text-sm font-semibold hover:bg-[#143D2B]"><Plus className="w-4 h-4" /> Tambah</button>
          )}
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-secondary/50 text-left">
              <th className="px-4 py-3 font-semibold">Nama Paket</th>
              <th className="px-4 py-3 font-semibold text-right">Modal</th>
              <th className="px-4 py-3 font-semibold text-right text-[#1B5E3B]">Harga Normal</th>
              <th className="px-4 py-3 font-semibold text-right text-[#C85A32]">Harga Reseller</th>
              {channels.map((c) => <th key={c.name} className="px-4 py-3 font-semibold text-right" style={{ color: c.color }}>{c.name}</th>)}
              <th className="px-4 py-3 font-semibold text-right">Stok</th>
              {isAdmin && <th className="px-4 py-3 font-semibold text-center">Aksi</th>}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr><td colSpan={7 + channels.length} className="px-4 py-10 text-center text-muted-foreground" data-testid="bundle-empty">
                <Boxes className="w-8 h-8 mx-auto mb-2 opacity-40" /> Belum ada paket bundling. {isAdmin && "Klik \"Tambah\" untuk membuat."}
              </td></tr>
            )}
            {sorted.map((b) => <BundleRow key={b.id} b={b} channels={channels} isAdmin={isAdmin}
              onPrice={(f, v, ch) => setPrice(b, f, v, ch)} onEdit={() => openEdit(b)} onDelete={() => del(b)} onReduce={() => reduce(b)} />)}
          </tbody>
        </table>
      </div>

      {modal && <BundleModal modal={modal} setModal={setModal} products={products} channels={channels} onSubmit={save} />}
    </div>
  );
}

function BundleRow({ b, channels, isAdmin, onPrice, onEdit, onDelete, onReduce }) {
  const anyHabis = b.components.some((c) => c.habis || c.missing);
  return (
    <tr className="border-b border-slate-100 hover:bg-secondary/30 align-top" data-testid={`bundle-row-${b.id}`}>
      <td className="px-4 py-3 font-medium">
        <div className="flex items-center gap-2 flex-wrap">
          <span>{b.name}</span>
          {b.stok <= 0 ? (
            <span data-testid={`bundle-stock-badge-${b.id}`} className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-destructive text-white"><AlertTriangle className="w-3 h-3" /> Habis</span>
          ) : b.stok <= 3 ? (
            <span data-testid={`bundle-stock-badge-${b.id}`} className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-300"><AlertTriangle className="w-3 h-3" /> Stok Menipis</span>
          ) : null}
          {b.hemat > 0 && <span data-testid={`bundle-hemat-${b.id}`} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">Hemat {rupiah(b.hemat)}</span>}
        </div>
        <p className="text-xs text-muted-foreground font-normal mt-0.5" data-testid={`bundle-comp-${b.id}`}>
          {b.components.map((c, i) => (
            <span key={i} className={c.habis || c.missing ? "text-destructive font-semibold" : ""}>{i > 0 && ", "}{c.qty}× {c.name}{c.missing ? " (hilang)" : c.habis ? " (habis)" : ""}</span>
          ))}
        </p>
        {anyHabis && <p className="text-[11px] text-destructive font-semibold mt-0.5" data-testid={`bundle-warning-${b.id}`}>Ada komponen habis, paket tidak bisa dijual</p>}
      </td>
      <td className="px-4 py-3 text-right font-mono">{rupiah(b.hpp)}</td>
      <PriceCell value={b.harga_jual} editable={isAdmin} onSave={(v) => onPrice("harga_jual", v)} testid={`bundle-price-normal-${b.id}`} className="font-semibold text-[#1B5E3B]" />
      <PriceCell value={b.harga_reseller || 0} editable={isAdmin} onSave={(v) => onPrice("harga_reseller", v)} testid={`bundle-price-reseller-${b.id}`} className="font-semibold text-[#C85A32]" />
      {channels.map((c) => {
        const price = b.harga_channel?.[c.name] || 0;
        const net = price - calcFees(c.fees, price).total;
        return (
          <PriceCell key={c.name} value={price} editable={isAdmin} onSave={(v) => onPrice("channel", v, c.name)} testid={`bundle-channel-price-${b.id}-${slug(c.name)}`}
            empty={<span className="text-xs italic text-muted-foreground">belum diatur</span>}>
            {price > 0 && <div className={`text-[10px] ${net < b.hpp ? "text-destructive font-semibold" : "text-muted-foreground"}`}>bersih {rupiah(net)}</div>}
          </PriceCell>
        );
      })}
      <td className="px-4 py-3 text-right font-mono" data-testid={`bundle-stock-${b.id}`}><span className={b.stok <= 3 ? "text-destructive font-semibold" : ""}>{b.stok} paket</span></td>
      {isAdmin && (
        <td className="px-4 py-3">
          <div className="flex items-center justify-center gap-1">
            <button onClick={onReduce} disabled={b.stok <= 0} title="Kurangi stok" data-testid={`bundle-reduce-${b.id}`} className="w-8 h-8 rounded-lg text-[#C85A32] hover:bg-orange-50 flex items-center justify-center disabled:opacity-40"><PackageMinus className="w-4 h-4" /></button>
            <button onClick={onEdit} data-testid={`bundle-edit-${b.id}`} className="w-8 h-8 rounded-lg hover:bg-secondary flex items-center justify-center"><Pencil className="w-4 h-4" /></button>
            <button onClick={onDelete} data-testid={`bundle-delete-${b.id}`} className="w-8 h-8 rounded-lg text-destructive hover:bg-red-50 flex items-center justify-center"><Trash2 className="w-4 h-4" /></button>
          </div>
        </td>
      )}
    </tr>
  );
}
