import { useEffect, useState } from "react";
import { api, apiError } from "@/lib/api";
import { rupiah, fmtDateTime, todayStr } from "@/lib/format";
import { exportPDF, exportExcel } from "@/lib/exporter";
import { Plus, Trash2, Truck, FileDown, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";

export default function Pembelian() {
  const [products, setProducts] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [month, setMonth] = useState(todayStr().slice(0, 7));
  const [supplier, setSupplier] = useState("");
  const [lines, setLines] = useState([]);
  const [note, setNote] = useState("");
  const [hutang, setHutang] = useState(false);
  const [amountPaid, setAmountPaid] = useState("");
  const [pick, setPick] = useState("");

  const loadProducts = () => api.get("/products").then((r) => setProducts(r.data));
  const loadPurchases = () => api.get(`/purchases?month=${month}`).then((r) => setPurchases(r.data));
  useEffect(() => { loadProducts(); }, []);
  useEffect(() => { loadPurchases(); }, [month]);

  const addLine = (pid) => {
    const p = products.find((x) => x.id === pid);
    if (!p || lines.find((l) => l.product_id === pid)) return;
    setLines([...lines, { product_id: p.id, name: p.name, qty: 1, harga_beli: p.harga_beli }]);
    setPick("");
  };
  const upd = (pid, k, v) => setLines(lines.map((l) => l.product_id === pid ? { ...l, [k]: v } : l));
  const total = lines.reduce((s, l) => s + Number(l.qty) * Number(l.harga_beli), 0);

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
      loadProducts(); loadPurchases();
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
            className="px-3 py-2.5 rounded-xl border border-input text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5E3B]" />
          <select value={pick} onChange={(e) => addLine(e.target.value)} data-testid="purchase-add-product"
            className="px-3 py-2.5 rounded-xl border border-input text-sm bg-white">
            <option value="">+ Tambah produk...</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
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
            </tr></thead>
            <tbody>
              {purchases.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Belum ada pembelian.</td></tr>}
              {purchases.map((p) => (
                <tr key={p.id} className="border-b border-slate-100" data-testid={`purchase-row-${p.id}`}>
                  <td className="px-4 py-2.5 font-mono text-xs">{p.po_no}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{fmtDateTime(p.created_at)}</td>
                  <td className="px-4 py-2.5">{p.supplier}</td>
                  <td className="px-4 py-2.5 text-center font-mono">{p.items.length}</td>
                  <td className="px-4 py-2.5 text-right font-mono font-semibold">{rupiah(p.total)}</td>
                  <td className="px-4 py-2.5 text-center"><span className={`text-xs px-2 py-1 rounded-lg ${p.status === "lunas" ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"}`}>{p.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
