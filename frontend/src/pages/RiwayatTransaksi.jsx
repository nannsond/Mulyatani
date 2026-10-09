import { useEffect, useState } from "react";
import { api, apiError } from "@/lib/api";
import { rupiah, fmtDateTime } from "@/lib/format";
import { printReceipt, exportPDF, exportExcel } from "@/lib/exporter";
import { useSettings } from "@/context/SettingsContext";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Search, Printer, Loader2, FileDown, FileSpreadsheet, X, Eye, Pencil, Trash2 } from "lucide-react";
import ProductSearch from "@/components/ProductSearch";

export default function RiwayatTransaksi() {
  const { settings } = useSettings();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [txs, setTxs] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const [products, setProducts] = useState([]);
  const [edit, setEdit] = useState(null);
  const [period, setPeriod] = useState("all");
  const [periodVal, setPeriodVal] = useState("");
  const [sort, setSort] = useState("desc");
  const [selected, setSelected] = useState([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  useEffect(() => { if (isAdmin) api.get("/products").then((r) => setProducts(r.data)); }, [isAdmin]);

  const logoUrl = settings?.has_logo
    ? `${process.env.REACT_APP_BACKEND_URL}/api/settings/logo?v=${encodeURIComponent(settings.logo_updated || "")}`
    : undefined;
  const storeInfo = { store_name: settings?.store_name, address: settings?.address, phone: settings?.phone };

  const dateParam = period !== "all" && periodVal ? periodVal : "";
  const load = (query = q) => {
    setLoading(true);
    const url = `/transactions?limit=${dateParam ? 10000 : 100}&sort=${sort}${dateParam ? `&date=${dateParam}` : ""}${query ? `&q=${encodeURIComponent(query)}` : ""}`;
    setSelected([]);
    api.get(url).then((r) => setTxs(r.data)).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [dateParam, sort]);
  const changePeriod = (v) => {
    const now = new Date();
    const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    setPeriod(v);
    setPeriodVal(v === "date" ? iso : v === "month" ? iso.slice(0, 7) : v === "year" ? iso.slice(0, 4) : "");
  };
  const years = Array.from({ length: 6 }, (_, i) => String(new Date().getFullYear() - i));
  const periodLabel = dateParam ? `Periode: ${dateParam}` : "Semua transaksi terbaru";

  const onSearch = (e) => { e.preventDefault(); load(q); };

  const openEdit = (t) => setEdit({
    id: t.id, invoice_no: t.invoice_no,
    items: t.items.map((i) => ({ product_id: i.product_id, name: i.name, qty: i.qty, harga: i.harga })),
    discount: t.discount || 0, discount_reason: t.discount_reason || "",
    payment_method: t.payment_method || "Tunai", customer_name: t.customer_name || "",
    ongkir: t.ongkir || 0, alamat: t.alamat || "", telepon: t.telepon || "",
    amount_paid: t.amount_paid ?? t.total,
  });
  const editSubtotal = edit ? edit.items.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.harga) || 0), 0) : 0;
  const editTotal = Math.max(0, editSubtotal - (Number(edit?.discount) || 0) + (Number(edit?.ongkir) || 0));
  const setItem = (idx, patch) => setEdit((e) => ({ ...e, items: e.items.map((it, k) => (k === idx ? { ...it, ...patch } : it)) }));
  const removeItem = (idx) => setEdit((e) => ({ ...e, items: e.items.filter((_, k) => k !== idx) }));
  const addItem = (pid) => {
    const p = products.find((x) => x.id === pid);
    if (!p) return;
    setEdit((e) => (e.items.some((i) => i.product_id === pid)
      ? { ...e, items: e.items.map((i) => (i.product_id === pid ? { ...i, qty: Number(i.qty) + 1 } : i)) }
      : { ...e, items: [...e.items, { product_id: p.id, name: p.name, qty: 1, harga: p.harga_jual }] }));
  };
  const saveEdit = async () => {
    if (edit.items.length === 0) { toast.error("Minimal 1 item"); return; }
    try {
      await api.put(`/transactions/${edit.id}`, {
        items: edit.items.map((i) => ({ product_id: i.product_id, name: i.name, qty: Number(i.qty), harga: Number(i.harga) })),
        payment_method: edit.payment_method, discount: Number(edit.discount) || 0, discount_reason: edit.discount_reason,
        customer_name: edit.customer_name, ongkir: Number(edit.ongkir) || 0, alamat: edit.alamat || "", telepon: edit.telepon || "", amount_paid: Number(edit.amount_paid),
      });
      toast.success("Transaksi diperbarui"); setEdit(null); load(q);
    } catch (err) { toast.error(apiError(err.response?.data?.detail)); }
  };
  const delTx = async (t) => {
    if (!window.confirm(`Hapus transaksi ${t.invoice_no}? Stok akan dikembalikan.`)) return;
    try { await api.delete(`/transactions/${t.id}`); toast.success("Transaksi dihapus"); load(q); }
    catch (err) { toast.error(apiError(err.response?.data?.detail)); }
  };

  const toggleOne = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const allChecked = txs.length > 0 && selected.length === txs.length;
  const toggleAll = () => setSelected(allChecked ? [] : txs.map((t) => t.id));
  const bulkDelete = async () => {
    if (!window.confirm(`Hapus ${selected.length} transaksi terpilih? Stok akan dikembalikan.`)) return;
    setBulkDeleting(true);
    let ok = 0;
    for (const id of selected) {
      try { await api.delete(`/transactions/${id}`); ok++; } catch { /* lanjut ke berikutnya */ }
    }
    setBulkDeleting(false);
    if (ok) toast.success(`${ok} transaksi dihapus`);
    if (ok < selected.length) toast.error(`${selected.length - ok} transaksi gagal dihapus`);
    load(q);
  };

  const cols = ["Invoice", "Waktu", "Kasir", "Pembayaran", "Item", "Total"];
  const rows = txs.map((t) => [t.invoice_no, fmtDateTime(t.created_at), t.cashier_name, t.payment_method, t.items.reduce((s, i) => s + i.qty, 0), t.total]);
  const foot = ["", "", "", "", "TOTAL", txs.reduce((s, t) => s + t.total, 0)];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <form onSubmit={onSearch} className="flex gap-2 flex-1 max-w-md">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} data-testid="riwayat-search-input"
              placeholder="Cari no. invoice..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5E3B]" />
          </div>
          <button type="submit" data-testid="riwayat-search-button" className="px-4 py-2.5 rounded-xl bg-[#1B5E3B] text-white text-sm font-semibold hover:bg-[#143D2B]">Cari</button>
        </form>
        <div className="flex flex-wrap items-center gap-2" data-testid="riwayat-period-filter">
          <select value={period} onChange={(e) => changePeriod(e.target.value)} data-testid="riwayat-period-select"
            className="px-3 py-2.5 rounded-xl border border-input bg-card text-sm">
            <option value="all">Semua Waktu</option>
            <option value="date">Per Tanggal</option>
            <option value="month">Per Bulan</option>
            <option value="year">Per Tahun</option>
          </select>
          {period === "date" && <input type="date" value={periodVal} onChange={(e) => setPeriodVal(e.target.value)} data-testid="riwayat-date-input" className="px-3 py-2 rounded-xl border border-input bg-card text-sm" />}
          {period === "month" && <input type="month" value={periodVal} onChange={(e) => setPeriodVal(e.target.value)} data-testid="riwayat-month-input" className="px-3 py-2 rounded-xl border border-input bg-card text-sm" />}
          {period === "year" && (
            <select value={periodVal} onChange={(e) => setPeriodVal(e.target.value)} data-testid="riwayat-year-select" className="px-3 py-2.5 rounded-xl border border-input bg-card text-sm">
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          )}
          <select value={sort} onChange={(e) => setSort(e.target.value)} data-testid="riwayat-sort-select"
            className="px-3 py-2.5 rounded-xl border border-input bg-card text-sm">
            <option value="desc">Terbaru dulu</option>
            <option value="asc">Terlama dulu</option>
          </select>
        </div>
        <div className="flex gap-2">
          {isAdmin && selected.length > 0 && (
            <button onClick={bulkDelete} disabled={bulkDeleting} data-testid="riwayat-bulk-delete-button"
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-destructive text-white text-sm font-semibold hover:opacity-90 disabled:opacity-60">
              {bulkDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Hapus Terpilih ({selected.length})
            </button>
          )}
          <button onClick={() => exportPDF({ title: "Riwayat Transaksi", subtitle: q ? `Filter: ${q} • ${periodLabel}` : periodLabel, columns: cols, rows, foot })} data-testid="export-pdf-button"
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-input text-sm hover:bg-secondary"><FileDown className="w-4 h-4" /> PDF</button>
          <button onClick={() => exportExcel({ filename: "Riwayat_Transaksi", sheetName: "Riwayat", columns: cols, rows })} data-testid="export-excel-button"
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-input text-sm hover:bg-secondary"><FileSpreadsheet className="w-4 h-4" /> Excel</button>
        </div>
      </div>

      {!loading && <PeriodSummary txs={txs} label={dateParam ? periodLabel : "100 transaksi terbaru"} />}

      {loading ? <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-[#1B5E3B]" /></div> : (
        <div className="bg-card rounded-2xl border border-slate-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-secondary/50 text-left">
                {isAdmin && <th className="pl-4 py-3 w-8"><input type="checkbox" checked={allChecked} onChange={toggleAll} data-testid="riwayat-select-all" className="w-4 h-4 accent-[#1B5E3B] cursor-pointer" /></th>}
                <th className="px-4 py-3 font-semibold">Invoice</th>
                <th className="px-4 py-3 font-semibold">Waktu</th>
                <th className="px-4 py-3 font-semibold">Kasir</th>
                <th className="px-4 py-3 font-semibold">Pembayaran</th>
                <th className="px-4 py-3 font-semibold text-center">Item</th>
                <th className="px-4 py-3 font-semibold text-right">Total</th>
                <th className="px-4 py-3 font-semibold text-center">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {txs.length === 0 && <tr><td colSpan={isAdmin ? 8 : 7} className="px-4 py-10 text-center text-muted-foreground">Tidak ada transaksi.</td></tr>}
              {txs.map((t) => (
                <tr key={t.id} onClick={() => setDetail(t)} className="border-b border-slate-100 hover:bg-secondary/30 cursor-pointer" data-testid={`riwayat-row-${t.id}`}>
                  {isAdmin && (
                    <td className="pl-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selected.includes(t.id)} onChange={() => toggleOne(t.id)} data-testid={`riwayat-select-${t.id}`} className="w-4 h-4 accent-[#1B5E3B] cursor-pointer" />
                    </td>
                  )}
                  <td className="px-4 py-3 font-mono text-xs">{t.invoice_no}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{fmtDateTime(t.created_at)}</td>
                  <td className="px-4 py-3">{t.cashier_name}</td>
                  <td className="px-4 py-3"><span className="text-xs px-2 py-1 rounded-lg bg-secondary">{t.payment_method}</span></td>
                  <td className="px-4 py-3 text-center font-mono">{t.items.reduce((s, i) => s + i.qty, 0)}</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-[#1B5E3B]">{rupiah(t.total)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => setDetail(t)} data-testid={`riwayat-detail-${t.id}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-input text-xs hover:bg-secondary"><Eye className="w-3.5 h-3.5" /> Detail</button>
                      <button onClick={() => printReceipt(t, logoUrl, storeInfo)} data-testid={`riwayat-print-${t.id}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-input text-xs hover:bg-secondary"><Printer className="w-3.5 h-3.5" /> Cetak</button>
                      {isAdmin && (
                        <>
                          <button onClick={() => openEdit(t)} data-testid={`riwayat-edit-${t.id}`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-input text-xs hover:bg-secondary"><Pencil className="w-3.5 h-3.5" /> Edit</button>
                          <button onClick={() => delTx(t)} data-testid={`riwayat-delete-${t.id}`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-input text-xs text-destructive hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" /></button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDetail(null)} />
          <div className="relative bg-white rounded-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto" data-testid="riwayat-detail-modal">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-heading font-bold text-lg">Detail Transaksi</h3>
              <button onClick={() => setDetail(null)} data-testid="riwayat-detail-close"><X className="w-5 h-5" /></button>
            </div>
            <p className="font-mono text-sm text-muted-foreground">{detail.invoice_no}</p>
            <div className="mt-3 text-sm space-y-1 pb-3 border-b border-slate-200">
              <div className="flex justify-between"><span className="text-muted-foreground">Waktu</span><span>{fmtDateTime(detail.created_at)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Kasir</span><span>{detail.cashier_name}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Pembayaran</span><span>{detail.payment_method}</span></div>
              {detail.ongkir > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Ongkos Kirim</span><span className="font-mono">{rupiah(detail.ongkir)}</span></div>}
              {detail.alamat && <div className="flex justify-between gap-3"><span className="text-muted-foreground shrink-0">Alamat Antar</span><span className="text-right font-medium text-[#0F281E]" data-testid="detail-alamat">{detail.alamat}</span></div>}
              {detail.telepon && <div className="flex justify-between"><span className="text-muted-foreground">No. HP</span><span className="font-medium text-[#0F281E]" data-testid="detail-telepon">{detail.telepon}</span></div>}
            </div>
            <div className="mt-3 space-y-2">
              {detail.items.map((i, idx) => (
                <div key={idx} className="flex justify-between gap-3 text-sm" data-testid={`detail-item-${idx}`}>
                  <div className="min-w-0">
                    <p className="font-medium truncate">{i.name}</p>
                    <p className="text-xs font-mono text-muted-foreground">{i.qty} x {rupiah(i.harga)}</p>
                  </div>
                  <span className="font-mono shrink-0">{rupiah(i.subtotal)}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-slate-200 flex justify-between items-center">
              <span className="font-semibold">Total</span>
              <span className="font-mono font-bold text-xl text-[#1B5E3B]">{rupiah(detail.total)}</span>
            </div>
            <button onClick={() => printReceipt(detail, logoUrl, storeInfo)} data-testid="riwayat-detail-print"
              className="mt-4 w-full flex items-center justify-center gap-2 bg-[#1B5E3B] text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-[#143D2B]">
              <Printer className="w-4 h-4" /> Cetak Struk PDF
            </button>
          </div>
        </div>
      )}

      {edit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setEdit(null)} />
          <div className="relative bg-white rounded-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" data-testid="riwayat-edit-modal">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-heading font-bold text-lg">Edit Transaksi</h3>
              <button onClick={() => setEdit(null)} data-testid="riwayat-edit-close"><X className="w-5 h-5" /></button>
            </div>
            <p className="font-mono text-sm text-muted-foreground mb-3">{edit.invoice_no}</p>

            <div className="space-y-2">
              {edit.items.map((i, idx) => (
                <div key={idx} className="flex items-center gap-2" data-testid={`edit-item-${idx}`}>
                  <span className="flex-1 min-w-0 truncate text-sm">{i.name}</span>
                  <input type="number" min="1" value={i.qty} onChange={(e) => setItem(idx, { qty: e.target.value })} data-testid={`edit-item-qty-${idx}`}
                    className="w-16 px-2 py-1.5 rounded-lg border border-input text-sm text-center" />
                  <span className="text-xs text-muted-foreground">x</span>
                  <input type="number" min="0" value={i.harga} onChange={(e) => setItem(idx, { harga: e.target.value })} data-testid={`edit-item-harga-${idx}`}
                    className="w-28 px-2 py-1.5 rounded-lg border border-input text-sm text-right font-mono" />
                  <button onClick={() => removeItem(idx)} data-testid={`edit-item-remove-${idx}`} className="text-destructive shrink-0"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
            </div>

            <div className="mt-3">
              <ProductSearch products={products} exclude={edit.items.map((i) => i.product_id)} onPick={addItem}
                placeholder="Cari & tambah produk..." testid="edit-add-item-select" />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Pelanggan</label>
                <input value={edit.customer_name} onChange={(e) => setEdit({ ...edit, customer_name: e.target.value })} data-testid="edit-customer-input"
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-input text-sm" />
              </div>
              <div>
                <label className="text-sm font-medium">Metode Bayar</label>
                <select value={edit.payment_method} onChange={(e) => setEdit({ ...edit, payment_method: e.target.value })} data-testid="edit-payment-select"
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-input text-sm bg-white">
                  {["Tunai", "Transfer", "QRIS", "Hutang"].map((m) => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Diskon (Rp)</label>
                <input type="number" min="0" value={edit.discount} onChange={(e) => setEdit({ ...edit, discount: e.target.value })} data-testid="edit-discount-input"
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-input text-sm font-mono" />
              </div>
              <div>
                <label className="text-sm font-medium">Jumlah Dibayar (Rp)</label>
                <input type="number" min="0" value={edit.amount_paid} onChange={(e) => setEdit({ ...edit, amount_paid: e.target.value })} data-testid="edit-amount-paid-input"
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-input text-sm font-mono" />
              </div>
              <div>
                <label className="text-sm font-medium">Ongkos Kirim (Rp)</label>
                <input type="number" min="0" value={edit.ongkir} onChange={(e) => setEdit({ ...edit, ongkir: e.target.value })} data-testid="edit-ongkir-input"
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-input text-sm font-mono" />
              </div>
              <div>
                <label className="text-sm font-medium">No. HP Pembeli</label>
                <input value={edit.telepon} onChange={(e) => setEdit({ ...edit, telepon: e.target.value })} data-testid="edit-telepon-input"
                  placeholder="08xxxxxxxxxx"
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-input text-sm" />
              </div>
              <div className="col-span-2">
                <label className="text-sm font-medium">Alamat Pengiriman</label>
                <input value={edit.alamat} onChange={(e) => setEdit({ ...edit, alamat: e.target.value })} data-testid="edit-alamat-input"
                  placeholder="Alamat pengiriman (jika diantar)"
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-input text-sm" />
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-200 space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="font-mono">{rupiah(editSubtotal)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Diskon</span><span className="font-mono text-destructive">({rupiah(Number(edit.discount) || 0)})</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Ongkos Kirim</span><span className="font-mono">{rupiah(Number(edit.ongkir) || 0)}</span></div>
              <div className="flex justify-between font-semibold"><span>Total</span><span className="font-mono text-[#1B5E3B]" data-testid="edit-total">{rupiah(editTotal)}</span></div>
            </div>

            <button onClick={saveEdit} data-testid="riwayat-edit-save"
              className="mt-4 w-full bg-[#1B5E3B] text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-[#143D2B]">Simpan Perubahan</button>
          </div>
        </div>
      )}
    </div>
  );
}

function PeriodSummary({ txs, label }) {
  const omzet = txs.reduce((s, t) => s + t.total, 0);
  const items = txs.reduce((s, t) => s + t.items.reduce((a, i) => a + i.qty, 0), 0);
  const cards = [
    { k: "omzet", t: "Total Omzet", v: rupiah(omzet), c: "text-[#1B5E3B]" },
    { k: "count", t: "Jumlah Transaksi", v: txs.length.toLocaleString("id-ID"), c: "text-[#0F281E]" },
    { k: "items", t: "Item Terjual", v: items.toLocaleString("id-ID"), c: "text-[#C85A32]" },
    { k: "avg", t: "Rata-rata / Transaksi", v: rupiah(txs.length ? Math.round(omzet / txs.length) : 0), c: "text-[#2563EB]" },
  ];
  return (
    <div data-testid="riwayat-period-summary">
      <p className="text-xs text-muted-foreground mb-2">Ringkasan: <span className="font-semibold">{label}</span></p>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((x) => (
          <div key={x.k} className="bg-card rounded-2xl border border-slate-200 p-4" data-testid={`riwayat-summary-${x.k}`}>
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">{x.t}</p>
            <p className={`mt-1 font-mono font-bold text-xl ${x.c}`}>{x.v}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
