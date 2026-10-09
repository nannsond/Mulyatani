import { useEffect, useRef, useState } from "react";
import { api, apiError } from "@/lib/api";
import { rupiah, fmtDateTime, todayStr } from "@/lib/format";
import { exportPDF, exportExcel } from "@/lib/exporter";
import { useAuth } from "@/context/AuthContext";
import { Plus, Trash2, Truck, FileDown, FileSpreadsheet, Pencil, X, Search } from "lucide-react";
import { toast } from "sonner";

// Pencarian produk ketik manual (typeahead) dengan qty cepat & harga beli terakhir
function ProductSearch({ products, exclude = [], onPick, placeholder = "Cari produk...", testid, lastPrices = {} }) {
  const [q, setQ] = useState("");
  const [qty, setQty] = useState("1");
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    const onDocClick = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const term = q.trim().toLowerCase();
  const matches = term
    ? products
        .filter((p) => !exclude.includes(p.id) && (p.name.toLowerCase().includes(term) || (p.sku || "").toLowerCase().includes(term)))
        .slice(0, 8)
    : [];

  const priceOf = (p) => (lastPrices[p.id]?.harga_beli ?? p.harga_beli);
  const choose = (p) => {
    onPick(p.id, Number(qty) || 1, priceOf(p));
    setQ(""); setQty("1"); setOpen(false);
  };
  const onKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (matches.length > 0) choose(matches[0]);
    }
  };

  return (
    <div className="relative flex gap-2" ref={boxRef}>
      <div className="relative flex-1">
        <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          data-testid={testid}
          className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-input text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1B5E3B]"
        />
        {open && term && (
          <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-56 overflow-y-auto" data-testid={testid ? `${testid}-results` : undefined}>
            {matches.length === 0 ? (
              <div className="px-3 py-2.5 text-sm text-muted-foreground">Produk tidak ditemukan</div>
            ) : (
              matches.map((p) => {
                const last = lastPrices[p.id]?.harga_beli;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => choose(p)}
                    data-testid={testid ? `${testid}-option-${p.id}` : undefined}
                    className="w-full text-left px-3 py-2.5 text-sm hover:bg-secondary flex items-center justify-between gap-2"
                  >
                    <span className="truncate">{p.name}</span>
                    <span className="text-xs shrink-0 text-right">
                      {last != null
                        ? <span className="text-[#1B5E3B] font-mono">Terakhir: {rupiah(last)}</span>
                        : <span className="text-muted-foreground font-mono">{rupiah(p.harga_beli)}</span>}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>
      <input
        type="number" min="1" value={qty}
        onChange={(e) => setQty(e.target.value)}
        onKeyDown={onKeyDown}
        title="Jumlah (Qty)"
        data-testid={testid ? `${testid}-qty` : undefined}
        className="w-16 px-2 py-2.5 rounded-xl border border-input text-sm text-center bg-white focus:outline-none focus:ring-2 focus:ring-[#1B5E3B]"
      />
    </div>
  );
}

export default function Pembelian() {
  const [products, setProducts] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [month, setMonth] = useState(todayStr().slice(0, 7));
  const [supplier, setSupplier] = useState("");
  const [lines, setLines] = useState([]);
  const [note, setNote] = useState("");
  const [hutang, setHutang] = useState(false);
  const [amountPaid, setAmountPaid] = useState("");
  const [suppliers, setSuppliers] = useState([]);
  const [lastPrices, setLastPrices] = useState({});
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [edit, setEdit] = useState(null);

  const loadProducts = () => api.get("/products").then((r) => setProducts(r.data));
  const loadPurchases = () => api.get(`/purchases?month=${month}`).then((r) => setPurchases(r.data));
  const loadSuppliers = () => api.get("/purchases/suppliers").then((r) => setSuppliers(r.data)).catch(() => {});
  const loadLastPrices = () => api.get("/purchases/last-prices").then((r) => setLastPrices(r.data)).catch(() => {});
  useEffect(() => { loadProducts(); loadSuppliers(); loadLastPrices(); }, []);
  useEffect(() => { loadPurchases(); }, [month]);

  const addLine = (pid, qty = 1, harga = null) => {
    const p = products.find((x) => x.id === pid);
    if (!p || lines.find((l) => l.product_id === pid)) return;
    setLines([...lines, { product_id: p.id, name: p.name, qty: Number(qty) || 1, harga_beli: harga ?? p.harga_beli }]);
  };
  const upd = (pid, k, v) => setLines(lines.map((l) => l.product_id === pid ? { ...l, [k]: v } : l));
  const total = lines.reduce((s, l) => s + Number(l.qty) * Number(l.harga_beli), 0);

  const openEdit = (p) => setEdit({
    id: p.id, po_no: p.po_no, supplier: p.supplier,
    items: p.items.map((i) => ({ product_id: i.product_id, name: i.name, qty: i.qty, harga_beli: i.harga_beli })),
    note: p.note || "", amount_paid: p.amount_paid ?? p.total,
  });
  const eTotal = edit ? edit.items.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.harga_beli) || 0), 0) : 0;
  const eSet = (idx, patch) => setEdit((e) => ({ ...e, items: e.items.map((it, k) => (k === idx ? { ...it, ...patch } : it)) }));
  const eRemove = (idx) => setEdit((e) => ({ ...e, items: e.items.filter((_, k) => k !== idx) }));
  const eAdd = (pid, qty = 1, harga = null) => {
    const p = products.find((x) => x.id === pid);
    if (!p) return;
    setEdit((e) => (e.items.some((i) => i.product_id === pid)
      ? { ...e, items: e.items.map((i) => (i.product_id === pid ? { ...i, qty: Number(i.qty) + (Number(qty) || 1) } : i)) }
      : { ...e, items: [...e.items, { product_id: p.id, name: p.name, qty: Number(qty) || 1, harga_beli: harga ?? p.harga_beli }] }));
  };
  const saveEdit = async () => {
    if (!edit.supplier || edit.items.length === 0) { toast.error("Lengkapi supplier & item"); return; }
    try {
      await api.put(`/purchases/${edit.id}`, {
        supplier: edit.supplier,
        items: edit.items.map((l) => ({ product_id: l.product_id, name: l.name, qty: Number(l.qty), harga_beli: Number(l.harga_beli) })),
        amount_paid: Number(edit.amount_paid),
        note: edit.note,
      });
      toast.success("Pembelian diperbarui & stok disesuaikan"); setEdit(null); loadProducts(); loadPurchases();
    } catch (err) { toast.error(apiError(err.response?.data?.detail)); }
  };

  const submit = async () => {
    if (!supplier || !lines.length) { toast.error("Lengkapi supplier & item"); return; }
    try {
      await api.post("/purchases", {
        supplier,
        items: lines.map((l) => ({ product_id: l.product_id, name: l.name, qty: Number(l.qty), harga_beli: Number(l.harga_beli) })),
        amount_paid: hutang ? Number(amountPaid) || 0 : null,
        note,
      });
      toast.success("Pembelian disimpan & stok ditambah");
      setSupplier(""); setLines([]); setNote(""); setHutang(false); setAmountPaid("");
      loadProducts(); loadPurchases(); loadSuppliers(); loadLastPrices();
    } catch (err) { toast.error(apiError(err.response?.data?.detail)); }
  };

  const totalBeli = purchases.reduce((s, p) => s + p.total, 0);
  const cols = ["No PO", "Tanggal", "Supplier", "Item", "Total", "Status"];
  const rows = purchases.map((p) => [p.po_no, fmtDateTime(p.created_at), p.supplier, p.items.length, p.total, p.status]);

  return (
    <div className="space-y-6">
      <div className="bg-card rounded-2xl border border-slate-200 p-6">
        <h3 className="font-heading font-semibold text-lg mb-4 flex items-center gap-2"><Truck className="w-5 h-5 text-[#1B5E3B]" /> Input Pembelian</h3>
        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          <input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Nama supplier" data-testid="purchase-supplier-input"
            list="supplier-list" autoComplete="off"
            className="px-3 py-2.5 rounded-xl border border-input text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5E3B]" />
          <datalist id="supplier-list">
            {suppliers.map((s) => <option key={s} value={s} />)}
          </datalist>
          <ProductSearch products={products} exclude={lines.map((l) => l.product_id)} onPick={addLine} lastPrices={lastPrices}
            placeholder="Cari & tambah produk..." testid="purchase-add-product" />
        </div>
        {lines.length > 0 && (
          <div className="space-y-2 mb-3">
            {lines.map((l) => (
              <div key={l.product_id} className="flex items-center gap-2 text-sm" data-testid={`purchase-line-${l.product_id}`}>
                <span className="flex-1 truncate">{l.name}</span>
                <input type="number" value={l.qty} onChange={(e) => upd(l.product_id, "qty", e.target.value)} className="w-16 px-2 py-1.5 rounded-lg border text-sm" placeholder="Qty" />
                <input type="number" value={l.harga_beli} onChange={(e) => upd(l.product_id, "harga_beli", e.target.value)} className="w-28 px-2 py-1.5 rounded-lg border text-sm" placeholder="Harga beli" />
                <span className="w-28 text-right font-mono">{rupiah(Number(l.qty) * Number(l.harga_beli))}</span>
                <button onClick={() => setLines(lines.filter((x) => x.product_id !== l.product_id))} className="text-destructive"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        )}
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Catatan (opsional)" data-testid="purchase-note-input"
          className="w-full px-3 py-2.5 rounded-xl border border-input text-sm mb-3" />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={hutang} onChange={(e) => setHutang(e.target.checked)} data-testid="purchase-hutang-check" /> Hutang (bayar sebagian)</label>
          {hutang && <input type="number" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} placeholder="Jumlah dibayar" data-testid="purchase-amount-paid" className="px-3 py-2 rounded-xl border text-sm w-40" />}
          <span className="font-mono font-bold text-xl text-[#1B5E3B] ml-auto">Total: {rupiah(total)}</span>
          <button onClick={submit} data-testid="purchase-save-button" className="px-5 py-2.5 rounded-xl bg-[#1B5E3B] text-white text-sm font-semibold hover:bg-[#143D2B] flex items-center gap-2"><Plus className="w-4 h-4" /> Simpan Pembelian</button>
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-slate-200 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h3 className="font-heading font-semibold text-lg">Laporan Pembelian</h3>
          <div className="flex gap-2">
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} data-testid="purchase-month-filter" className="px-3 py-2 rounded-xl border border-input text-sm" />
            <button onClick={() => exportPDF({ title: "Laporan Pembelian", subtitle: month, columns: cols, rows, foot: ["", "", "", "TOTAL", totalBeli, ""] })} data-testid="export-pdf-button" className="flex items-center gap-2 px-3 py-2 rounded-xl border border-input text-sm hover:bg-secondary"><FileDown className="w-4 h-4" /> PDF</button>
            <button onClick={() => exportExcel({ filename: `Pembelian_${month}`, sheetName: "Pembelian", columns: cols, rows })} data-testid="export-excel-button" className="flex items-center gap-2 px-3 py-2 rounded-xl border border-input text-sm hover:bg-secondary"><FileSpreadsheet className="w-4 h-4" /> Excel</button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mb-3">Total pembelian bulan ini: <span className="font-mono font-bold text-[#0F281E]">{rupiah(totalBeli)}</span></p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-200 bg-secondary/50 text-left">
              <th className="px-4 py-2.5 font-semibold">No PO</th><th className="px-4 py-2.5 font-semibold">Tanggal</th><th className="px-4 py-2.5 font-semibold">Supplier</th><th className="px-4 py-2.5 font-semibold text-center">Item</th><th className="px-4 py-2.5 font-semibold text-right">Total</th><th className="px-4 py-2.5 font-semibold text-center">Status</th>
              {isAdmin && <th className="px-4 py-2.5 font-semibold text-center">Aksi</th>}
            </tr></thead>
            <tbody>
              {purchases.length === 0 && <tr><td colSpan={isAdmin ? 7 : 6} className="px-4 py-8 text-center text-muted-foreground">Belum ada pembelian.</td></tr>}
              {purchases.map((p) => (
                <tr key={p.id} className="border-b border-slate-100" data-testid={`purchase-row-${p.id}`}>
                  <td className="px-4 py-2.5 font-mono text-xs">{p.po_no}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{fmtDateTime(p.created_at)}</td>
                  <td className="px-4 py-2.5">{p.supplier}</td>
                  <td className="px-4 py-2.5 text-center font-mono">{p.items.length}</td>
                  <td className="px-4 py-2.5 text-right font-mono font-semibold">{rupiah(p.total)}</td>
                  <td className="px-4 py-2.5 text-center"><span className={`text-xs px-2 py-1 rounded-lg ${p.status === "lunas" ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"}`}>{p.status}</span></td>
                  {isAdmin && (
                    <td className="px-4 py-2.5 text-center">
                      <button onClick={() => openEdit(p)} data-testid={`purchase-edit-${p.id}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-input text-xs hover:bg-secondary"><Pencil className="w-3.5 h-3.5" /> Edit</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {edit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setEdit(null)} />
          <div className="relative bg-white rounded-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" data-testid="purchase-edit-modal">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-heading font-bold text-lg">Edit Pembelian</h3>
              <button onClick={() => setEdit(null)} data-testid="purchase-edit-close"><X className="w-5 h-5" /></button>
            </div>
            <p className="font-mono text-sm text-muted-foreground mb-3">{edit.po_no}</p>

            <label className="text-sm font-medium">Supplier</label>
            <input value={edit.supplier} onChange={(e) => setEdit({ ...edit, supplier: e.target.value })} data-testid="edit-supplier-input"
              className="mt-1 mb-3 w-full px-3 py-2 rounded-lg border border-input text-sm" />

            <div className="space-y-2">
              {edit.items.map((l, idx) => (
                <div key={idx} className="flex items-center gap-2 text-sm" data-testid={`edit-purchase-line-${idx}`}>
                  <span className="flex-1 min-w-0 truncate">{l.name}</span>
                  <input type="number" min="1" value={l.qty} onChange={(e) => eSet(idx, { qty: e.target.value })} data-testid={`edit-purchase-qty-${idx}`}
                    className="w-16 px-2 py-1.5 rounded-lg border border-input text-sm text-center" />
                  <span className="text-xs text-muted-foreground">x</span>
                  <input type="number" min="0" value={l.harga_beli} onChange={(e) => eSet(idx, { harga_beli: e.target.value })} data-testid={`edit-purchase-harga-${idx}`}
                    className="w-28 px-2 py-1.5 rounded-lg border border-input text-sm text-right font-mono" />
                  <button onClick={() => eRemove(idx)} data-testid={`edit-purchase-remove-${idx}`} className="text-destructive shrink-0"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
            </div>

            <div className="mt-3">
              <ProductSearch products={products} exclude={edit.items.map((i) => i.product_id)} onPick={eAdd} lastPrices={lastPrices}
                placeholder="Cari & tambah produk..." testid="edit-purchase-add-select" />
            </div>

            <input value={edit.note} onChange={(e) => setEdit({ ...edit, note: e.target.value })} placeholder="Catatan (opsional)" data-testid="edit-purchase-note"
              className="mt-3 w-full px-3 py-2 rounded-lg border border-input text-sm" />

            <div className="mt-3">
              <label className="text-sm font-medium">Jumlah Dibayar (Rp)</label>
              <input type="number" min="0" value={edit.amount_paid} onChange={(e) => setEdit({ ...edit, amount_paid: e.target.value })} data-testid="edit-purchase-amount-paid"
                className="mt-1 w-full px-3 py-2 rounded-lg border border-input text-sm font-mono" />
            </div>

            <div className="mt-4 pt-3 border-t border-slate-200 flex justify-between items-center">
              <span className="font-semibold">Total</span>
              <span className="font-mono font-bold text-xl text-[#1B5E3B]" data-testid="edit-purchase-total">{rupiah(eTotal)}</span>
            </div>
            <button onClick={saveEdit} data-testid="purchase-edit-save"
              className="mt-4 w-full bg-[#1B5E3B] text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-[#143D2B]">Simpan Perubahan</button>
          </div>
        </div>
      )}
    </div>
  );
}
