import { useEffect, useState } from "react";
import { api, apiError } from "@/lib/api";
import { rupiah } from "@/lib/format";
import { useAuth } from "@/context/AuthContext";
import { useSettings } from "@/context/SettingsContext";
import { Plus, Pencil, Trash2, FileDown, FileSpreadsheet, X, Search, User, Users, Printer, AlertTriangle } from "lucide-react";
import { exportPDF, exportExcel, printPriceList } from "@/lib/exporter";
import { toast } from "sonner";

const EMPTY = { sku: "", name: "", category: "Pupuk", unit: "pcs", harga_beli: 0, harga_jual: 0, harga_reseller: 0, stok: 0, stok_minimal: 10 };
const CATS = ["Pupuk", "Benih", "Pestisida", "Alat Tani", "Lainnya"];

export default function DaftarHarga() {
  const { user } = useAuth();
  const { settings } = useSettings();
  const isAdmin = user?.role === "admin";
  const logoUrl = settings?.has_logo ? `${process.env.REACT_APP_BACKEND_URL}/api/settings/logo?v=${encodeURIComponent(settings.logo_updated || "")}` : undefined;
  const storeInfo = { store_name: settings?.store_name, address: settings?.address, phone: settings?.phone };
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("normal");
  const [sortBy, setSortBy] = useState("name");
  const [lowOnly, setLowOnly] = useState(false);
  const [modal, setModal] = useState(null);

  const load = () => api.get("/products").then((r) => setProducts(r.data));
  useEffect(() => { load(); }, []);

  const stockLevel = (p) => (p.stok <= 0 ? 2 : p.stok <= p.stok_minimal ? 1 : 0);
  const lowCount = products.filter((p) => stockLevel(p) > 0).length;

  const filtered = products.filter((p) =>
    (p.name.toLowerCase().includes(search.toLowerCase()) || p.category.toLowerCase().includes(search.toLowerCase()))
    && (!lowOnly || stockLevel(p) > 0));

  const sorted = [...filtered].sort((a, b) => {
    const la = stockLevel(a), lb = stockLevel(b);
    if (la !== lb) return lb - la;
    if (sortBy === "category") {
      const c = a.category.localeCompare(b.category, "id");
      return c !== 0 ? c : a.name.localeCompare(b.name, "id");
    }
    if (sortBy === "name_desc") return b.name.localeCompare(a.name, "id");
    return a.name.localeCompare(b.name, "id");
  });

  const save = async (e) => {
    e.preventDefault();
    const body = { ...modal };
    delete body.id;
    ["harga_beli", "harga_jual", "harga_reseller", "stok", "stok_minimal"].forEach((k) => (body[k] = Number(body[k])));
    try {
      if (modal.id) await api.put(`/products/${modal.id}`, body);
      else await api.post("/products", body);
      toast.success("Produk disimpan");
      setModal(null); load();
    } catch (err) { toast.error(apiError(err.response?.data?.detail)); }
  };

  const del = async (id) => {
    if (!window.confirm("Hapus produk ini?")) return;
    await api.delete(`/products/${id}`);
    toast.success("Produk dihapus"); load();
  };

  const isReseller = tab === "reseller";
  const priceLabel = isReseller ? "Harga Reseller" : "Harga Normal";
  const cols = ["SKU", "Nama Produk", "Kategori", "Satuan", priceLabel, "Stok"];
  const rows = sorted.map((p) => [p.sku, p.name, p.category, p.unit, isReseller ? (p.harga_reseller || 0) : p.harga_jual, p.stok]);
  const exportTitle = `Daftar ${priceLabel}`;

  return (
    <div className="space-y-5">
      <div className="flex rounded-xl border border-input overflow-hidden w-fit" data-testid="price-tab">
        <button onClick={() => setTab("normal")} data-testid="price-tab-normal"
          className={`flex items-center gap-2 px-5 py-2.5 text-sm font-semibold transition-colors ${!isReseller ? "bg-[#1B5E3B] text-white" : "bg-card hover:bg-secondary"}`}>
          <User className="w-4 h-4" /> Harga Normal
        </button>
        <button onClick={() => setTab("reseller")} data-testid="price-tab-reseller"
          className={`flex items-center gap-2 px-5 py-2.5 text-sm font-semibold transition-colors ${isReseller ? "bg-[#C85A32] text-white" : "bg-card hover:bg-secondary"}`}>
          <Users className="w-4 h-4" /> Harga Reseller
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} data-testid="product-search-input"
            placeholder="Cari produk..." className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5E3B]" />
        </div>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} data-testid="product-sort-select"
          className="px-3 py-2.5 rounded-xl border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5E3B]">
          <option value="name">Urutkan: Nama A-Z</option>
          <option value="name_desc">Urutkan: Nama Z-A</option>
          <option value="category">Urutkan: Kategori</option>
        </select>
        <button onClick={() => setLowOnly((v) => !v)} data-testid="low-stock-filter-toggle"
          className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-semibold transition-colors ${lowOnly ? "bg-destructive text-white border-destructive" : "border-input bg-card hover:bg-secondary"}`}>
          <AlertTriangle className="w-4 h-4" /> Stok Menipis
          {lowCount > 0 && (
            <span data-testid="low-stock-count" className={`min-w-5 px-1.5 py-0.5 rounded-full text-xs font-bold ${lowOnly ? "bg-white text-destructive" : "bg-destructive text-white"}`}>{lowCount}</span>
          )}
        </button>
        <div className="flex gap-2">
          <button onClick={() => printPriceList({ products: sorted, mode: tab, logoUrl, info: storeInfo })} data-testid="print-pricelist-button"
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-input text-sm hover:bg-secondary"><Printer className="w-4 h-4" /> Cetak</button>
          <button onClick={() => exportPDF({ title: exportTitle, columns: cols, rows })} data-testid="export-pdf-button"
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-input text-sm hover:bg-secondary"><FileDown className="w-4 h-4" /> PDF</button>
          <button onClick={() => exportExcel({ filename: exportTitle.replace(/\s+/g, "_"), sheetName: "Produk", columns: cols, rows })} data-testid="export-excel-button"
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-input text-sm hover:bg-secondary"><FileSpreadsheet className="w-4 h-4" /> Excel</button>
          {isAdmin && (
            <button onClick={() => setModal({ ...EMPTY })} data-testid="product-add-modal-trigger"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#1B5E3B] text-white text-sm font-semibold hover:bg-[#143D2B]"><Plus className="w-4 h-4" /> Tambah</button>
          )}
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-secondary/50 text-left">
              <th className="px-4 py-3 font-semibold">SKU</th>
              <th className="px-4 py-3 font-semibold">Nama Produk</th>
              <th className="px-4 py-3 font-semibold">Kategori</th>
              <th className="px-4 py-3 font-semibold text-right">Harga Beli</th>
              <th className={`px-4 py-3 font-semibold text-right ${!isReseller ? "text-[#1B5E3B]" : ""}`}>Harga Normal</th>
              <th className={`px-4 py-3 font-semibold text-right ${isReseller ? "text-[#C85A32]" : ""}`}>Harga Reseller</th>
              <th className="px-4 py-3 font-semibold text-right">Stok</th>
              {isAdmin && <th className="px-4 py-3 font-semibold text-center">Aksi</th>}
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => (
              <tr key={p.id} className="border-b border-slate-100 hover:bg-secondary/30" data-testid={`product-row-${p.id}`}>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{p.sku}</td>
                <td className="px-4 py-3 font-medium">
                  <div className="flex items-center gap-2">
                    <span>{p.name}</span>
                    {p.stok <= 0 ? (
                      <span data-testid={`stock-badge-${p.id}`} className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-destructive text-white">
                        <AlertTriangle className="w-3 h-3" /> Habis
                      </span>
                    ) : p.stok <= p.stok_minimal ? (
                      <span data-testid={`stock-badge-${p.id}`} className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-300">
                        <AlertTriangle className="w-3 h-3" /> Stok Menipis
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-3"><span className="text-xs px-2 py-1 rounded-lg bg-secondary">{p.category}</span></td>
                <td className="px-4 py-3 text-right font-mono">{rupiah(p.harga_beli)}</td>
                <td className={`px-4 py-3 text-right font-mono ${!isReseller ? "font-semibold text-[#1B5E3B]" : "text-muted-foreground"}`}>{rupiah(p.harga_jual)}</td>
                <td className={`px-4 py-3 text-right font-mono ${isReseller ? "font-semibold text-[#C85A32]" : "text-muted-foreground"}`}>{rupiah(p.harga_reseller || 0)}</td>
                <td className="px-4 py-3 text-right font-mono"><span className={p.stok <= p.stok_minimal ? "text-destructive font-semibold" : ""}>{p.stok} {p.unit}</span></td>
                {isAdmin && (
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => setModal(p)} data-testid={`product-edit-${p.id}`} className="w-8 h-8 rounded-lg hover:bg-secondary flex items-center justify-center"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => del(p.id)} data-testid={`product-delete-${p.id}`} className="w-8 h-8 rounded-lg text-destructive hover:bg-red-50 flex items-center justify-center"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setModal(null)} />
          <form onSubmit={save} className="relative bg-white rounded-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" data-testid="product-modal">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-heading font-bold text-lg">{modal.id ? "Edit Produk" : "Tambah Produk"}</h3>
              <button type="button" onClick={() => setModal(null)}><X className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="SKU" testid="product-sku-input" value={modal.sku} onChange={(v) => setModal({ ...modal, sku: v })} />
              <div>
                <label className="text-sm font-medium">Kategori</label>
                <select value={modal.category} onChange={(e) => setModal({ ...modal, category: e.target.value })} data-testid="product-category-select"
                  className="mt-1 w-full px-3 py-2.5 rounded-xl border border-input text-sm bg-white">
                  {CATS.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="col-span-2"><Field label="Nama Produk" testid="product-name-input" value={modal.name} onChange={(v) => setModal({ ...modal, name: v })} /></div>
              <Field label="Satuan" testid="product-unit-input" value={modal.unit} onChange={(v) => setModal({ ...modal, unit: v })} />
              <Field label="Harga Beli" type="number" testid="product-harga-beli-input" value={modal.harga_beli} onChange={(v) => setModal({ ...modal, harga_beli: v })} />
              <Field label="Harga Normal" type="number" testid="product-harga-jual-input" value={modal.harga_jual} onChange={(v) => setModal({ ...modal, harga_jual: v })} />
              <Field label="Harga Reseller" type="number" testid="product-harga-reseller-input" value={modal.harga_reseller} onChange={(v) => setModal({ ...modal, harga_reseller: v })} />
              <Field label="Stok" type="number" testid="product-stok-input" value={modal.stok} onChange={(v) => setModal({ ...modal, stok: v })} />
              <Field label="Stok Minimal" type="number" testid="product-stok-min-input" value={modal.stok_minimal} onChange={(v) => setModal({ ...modal, stok_minimal: v })} />
            </div>
            <button type="submit" data-testid="product-save-button" className="mt-5 w-full bg-[#1B5E3B] text-white py-3 rounded-xl font-semibold hover:bg-[#143D2B]">Simpan</button>
          </form>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, type = "text", testid }) {
  return (
    <div>
      <label className="text-sm font-medium">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} required data-testid={testid}
        className="mt-1 w-full px-3 py-2.5 rounded-xl border border-input text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5E3B]" />
    </div>
  );
}
