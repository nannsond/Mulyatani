import { useEffect, useRef, useState } from "react";
import { api, apiError } from "@/lib/api";
import { ClipboardCheck, Trash2, Layers, CheckCheck, CloudCheck } from "lucide-react";
import { fmtDateTime } from "@/lib/format";
import { toast } from "sonner";
import { ProductSearchInput } from "@/components/ProductSearchInput";

export const ALASAN = ["Penyesuaian", "Rusak", "Kadaluarsa", "Hilang", "Bonus Supplier", "Kesalahan Input"];

export function badge(selisih) {
  if (selisih === 0) return { t: "Sesuai", c: "bg-green-100 text-green-700" };
  if (selisih < 0) return { t: `Kurang ${selisih}`, c: "bg-red-100 text-red-700" };
  return { t: `Lebih +${selisih}`, c: "bg-blue-100 text-blue-700" };
}

const inputCls = "w-full px-2 py-1.5 rounded-lg border border-input text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5E3B]";

function SessionRow({ row, product, onChange, onRemove }) {
  const selisih = row.stok_fisik === "" ? null : Number(row.stok_fisik) - product.stok;
  return (
    <div className="p-3 rounded-xl border border-slate-200 space-y-2" data-testid={`opname-session-row-${product.id}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">{product.name}</div>
          <div className="text-xs text-muted-foreground">{product.sku} · Sistem <span className="font-mono font-semibold text-[#1B5E3B]">{product.stok} {product.unit}</span></div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button type="button" onClick={() => onChange({ ...row, stok_fisik: String(product.stok) })} data-testid={`opname-session-same-${product.id}`}
            title="Isi stok fisik sama dengan sistem"
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold border transition-colors ${String(product.stok) === row.stok_fisik ? "bg-green-100 border-green-200 text-green-700" : "border-slate-200 text-[#1B5E3B] hover:bg-emerald-50"}`}>
            <CheckCheck className="w-3.5 h-3.5" /> Sama
          </button>
          <button type="button" onClick={onRemove} data-testid={`opname-session-remove-${product.id}`} className="p-1 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input type="number" min="0" value={row.stok_fisik} placeholder="Stok fisik" data-testid={`opname-session-fisik-${product.id}`}
          onChange={(e) => onChange({ ...row, stok_fisik: e.target.value })} className={inputCls} />
        <select value={row.alasan} onChange={(e) => onChange({ ...row, alasan: e.target.value })} data-testid={`opname-session-alasan-${product.id}`} className={`${inputCls} bg-white`}>
          {ALASAN.map((a) => <option key={a}>{a}</option>)}
        </select>
      </div>
      {selisih !== null && (
        <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-lg ${badge(selisih).c}`} data-testid={`opname-session-selisih-${product.id}`}>{badge(selisih).t}</span>
      )}
    </div>
  );
}

export function OpnameSessionForm({ products, onSaved }) {
  const [rows, setRows] = useState([]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [cat, setCat] = useState("");
  const categories = [...new Set(products.map((p) => p.category || "Lainnya"))].sort((a, b) => a.localeCompare(b, "id"));
  const pmap = Object.fromEntries(products.map((p) => [p.id, p]));
  const [draftAt, setDraftAt] = useState(null);
  const loaded = useRef(false);

  useEffect(() => {
    api.get("/stok-opname/draft").then(({ data }) => {
      if (data.items?.length) {
        setRows(data.items); setNote(data.note || ""); setDraftAt(data.updated_at);
        toast.info(`Draf opname dilanjutkan (${data.items.length} produk)`);
      }
    }).finally(() => { loaded.current = true; });
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    const t = setTimeout(() => {
      api.put("/stok-opname/draft", { items: rows, note }).then(({ data }) => setDraftAt(data.updated_at)).catch(() => {});
    }, 700);
    return () => clearTimeout(t);
  }, [rows, note]);

  const add = (p) => {
    if (rows.some((r) => r.product_id === p.id)) { toast.info("Produk sudah ada di sesi"); return; }
    setRows([...rows, { product_id: p.id, stok_fisik: "", alasan: "Penyesuaian" }]);
  };
  const addCategory = () => {
    if (!cat) { toast.error("Pilih kategori dulu"); return; }
    const have = new Set(rows.map((r) => r.product_id));
    const fresh = products.filter((p) => (p.category || "Lainnya") === cat && !have.has(p.id))
      .sort((a, b) => a.name.localeCompare(b.name, "id"));
    if (fresh.length === 0) { toast.info("Semua produk kategori ini sudah ada di sesi"); return; }
    setRows([...rows, ...fresh.map((p) => ({ product_id: p.id, stok_fisik: "", alasan: "Penyesuaian" }))]);
    toast.success(`${fresh.length} produk ${cat} ditambahkan`);
  };
  const update = (i, row) => setRows(rows.map((r, j) => (j === i ? row : r)));

  const allRows = rows;
  const submit = async (e) => {
    e.preventDefault();
    const rows = allRows.filter((r) => pmap[r.product_id]);
    if (rows.length === 0) { toast.error("Tambahkan produk dulu"); return; }
    if (rows.some((r) => r.stok_fisik === "")) { toast.error("Isi stok fisik semua produk"); return; }
    setSaving(true);
    try {
      const { data } = await api.post("/stok-opname/bulk", {
        items: rows.map((r) => ({ product_id: r.product_id, stok_fisik: Number(r.stok_fisik), alasan: r.alasan, note })),
      });
      toast.success(`${data.count} produk disesuaikan (${data.sesuai} sesuai)`);
      setRows([]); setNote("");
      onSaved();
    } catch (err) { toast.error(apiError(err.response?.data?.detail)); }
    setSaving(false);
  };

  return (
    <form onSubmit={submit} className="bg-card rounded-2xl border border-slate-200 p-6 h-fit space-y-4" data-testid="opname-session-form">
      <h3 className="font-heading font-semibold text-lg text-[#0F281E] flex items-center gap-2">
        <ClipboardCheck className="w-5 h-5" /> Input Opname
        {rows.length > 0 && <span className="ml-auto text-xs font-medium px-2 py-1 rounded-lg bg-secondary" data-testid="opname-session-count">{rows.filter((r) => r.stok_fisik !== "").length}/{rows.length} dihitung</span>}
        {rows.length > 0 && <button type="button" onClick={() => { setRows([]); setNote(""); }} data-testid="opname-session-clear" className="text-xs text-red-500 hover:underline">Kosongkan</button>}
      </h3>
      <div>
        <label className="text-sm font-medium">Tambah Produk</label>
        <ProductSearchInput products={products} onSelect={add} />
      </div>
      <div>
        <label className="text-sm font-medium">Atau Tambah Satu Kategori</label>
        <div className="mt-1 flex gap-2">
          <select value={cat} onChange={(e) => setCat(e.target.value)} data-testid="opname-category-select"
            className="flex-1 min-w-0 px-3 py-2.5 rounded-xl border border-input text-sm bg-white">
            <option value="">-- Pilih Kategori --</option>
            {categories.map((c) => <option key={c} value={c}>{`${c} (${products.filter((p) => (p.category || "Lainnya") === c).length})`}</option>)}
          </select>
          <button type="button" onClick={addCategory} data-testid="opname-category-add-button"
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-[#1B5E3B] text-[#1B5E3B] text-sm font-semibold hover:bg-emerald-50 transition-colors whitespace-nowrap">
            <Layers className="w-4 h-4" /> Tambah Semua
          </button>
        </div>
      </div>
      {draftAt && rows.length > 0 && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground" data-testid="opname-draft-status">
          <CloudCheck className="w-3.5 h-3.5 text-[#1B5E3B]" /> Draf tersimpan otomatis · {fmtDateTime(draftAt)}
        </div>
      )}
      <div className="space-y-2 max-h-[420px] overflow-auto">
        {rows.length === 0 && <div className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-xl">Belum ada produk di sesi ini.</div>}
        {rows.map((r, i) => pmap[r.product_id] && (
          <SessionRow key={r.product_id} row={r} product={pmap[r.product_id]} onChange={(row) => update(i, row)}
            onRemove={() => setRows(rows.filter((_, j) => j !== i))} />
        ))}
      </div>
      <div>
        <label className="text-sm font-medium">Catatan</label>
        <input value={note} onChange={(e) => setNote(e.target.value)} data-testid="stok-opname-note-input"
          className="mt-1 w-full px-3 py-2.5 rounded-xl border border-input text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5E3B]" placeholder="Opsional, berlaku untuk semua produk" />
      </div>
      <button type="submit" disabled={saving} data-testid="stok-opname-save-button" className="w-full bg-[#1B5E3B] text-white py-3 rounded-xl font-semibold hover:bg-[#143D2B] disabled:opacity-60">
        {saving ? "Menyimpan..." : `Simpan & Sesuaikan ${rows.length || ""} Stok`}
      </button>
    </form>
  );
}
