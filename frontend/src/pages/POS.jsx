import { useEffect, useState } from "react";
import { api, apiError } from "@/lib/api";
import { rupiah } from "@/lib/format";
import { Search, Plus, Minus, Trash2, ShoppingCart, Loader2, CheckCircle2, Printer } from "lucide-react";
import { toast } from "sonner";
import { printReceipt } from "@/lib/exporter";
import { useSettings } from "@/context/SettingsContext";

export default function POS() {
  const { settings } = useSettings();
  const logoUrl = settings?.has_logo ? `${process.env.REACT_APP_BACKEND_URL}/api/settings/logo?v=${encodeURIComponent(settings.logo_updated || "")}` : undefined;
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState([]);
  const [payment, setPayment] = useState("Tunai");
  const [saving, setSaving] = useState(false);
  const [lastInvoice, setLastInvoice] = useState(null);

  const load = () => api.get("/products").then((r) => setProducts(r.data));
  useEffect(() => { load(); }, []);

  const filtered = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase())
  );

  const addToCart = (p) => {
    if (p.stok <= 0) { toast.error("Stok habis"); return; }
    setCart((c) => {
      const ex = c.find((i) => i.product_id === p.id);
      if (ex) {
        if (ex.qty >= p.stok) { toast.error("Melebihi stok"); return c; }
        return c.map((i) => i.product_id === p.id ? { ...i, qty: i.qty + 1 } : i);
      }
      return [...c, { product_id: p.id, name: p.name, harga: p.harga_jual, qty: 1, stok: p.stok }];
    });
  };

  const setQty = (id, delta) => setCart((c) =>
    c.map((i) => i.product_id === id ? { ...i, qty: Math.max(1, Math.min(i.stok, i.qty + delta)) } : i));

  const removeItem = (id) => setCart((c) => c.filter((i) => i.product_id !== id));

  const total = cart.reduce((s, i) => s + i.qty * i.harga, 0);

  const checkout = async () => {
    if (!cart.length) return;
    setSaving(true);
    try {
      const { data } = await api.post("/transactions", {
        items: cart.map((i) => ({ product_id: i.product_id, name: i.name, qty: i.qty, harga: i.harga })),
        payment_method: payment,
      });
      setLastInvoice(data);
      toast.success(`Transaksi ${data.invoice_no} berhasil!`);
      printReceipt(data, logoUrl);
      setCart([]);
      load();
    } catch (err) {
      toast.error(apiError(err.response?.data?.detail));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            data-testid="pos-search-product-input"
            placeholder="Cari produk / SKU..."
            className="w-full pl-10 pr-4 py-3 rounded-xl border border-input bg-card focus:outline-none focus:ring-2 focus:ring-[#1B5E3B] text-sm"
          />
        </div>
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((p) => (
            <button
              key={p.id} onClick={() => addToCart(p)} disabled={p.stok <= 0}
              data-testid={`pos-product-${p.id}`}
              className="text-left bg-card rounded-xl border border-slate-200 p-4 hover:border-[#1B5E3B] hover:shadow-md transition-all disabled:opacity-50"
            >
              <span className="text-[10px] uppercase tracking-wider font-semibold text-[#C85A32]">{p.category}</span>
              <p className="font-medium text-sm text-[#0F281E] mt-1 line-clamp-2 min-h-[2.5rem]">{p.name}</p>
              <div className="flex items-center justify-between mt-2">
                <span className="font-mono font-bold text-[#1B5E3B]">{rupiah(p.harga_jual)}</span>
                <span className={`text-xs ${p.stok <= p.stok_minimal ? "text-destructive" : "text-muted-foreground"}`}>Stok: {p.stok}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-slate-200 p-5 h-fit lg:sticky lg:top-24">
        <h3 className="font-heading font-semibold text-lg text-[#0F281E] mb-4 flex items-center gap-2">
          <ShoppingCart className="w-5 h-5" /> Keranjang
        </h3>
        {cart.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Belum ada item.</p>
        ) : (
          <div className="space-y-3 max-h-[40vh] overflow-y-auto">
            {cart.map((i) => (
              <div key={i.product_id} className="flex items-center gap-2" data-testid={`cart-item-${i.product_id}`}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{i.name}</p>
                  <p className="text-xs font-mono text-muted-foreground">{rupiah(i.harga)}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setQty(i.product_id, -1)} className="w-7 h-7 rounded-lg border flex items-center justify-center hover:bg-secondary"><Minus className="w-3 h-3" /></button>
                  <span className="w-7 text-center text-sm font-mono">{i.qty}</span>
                  <button onClick={() => setQty(i.product_id, 1)} className="w-7 h-7 rounded-lg border flex items-center justify-center hover:bg-secondary"><Plus className="w-3 h-3" /></button>
                  <button onClick={() => removeItem(i.product_id)} className="w-7 h-7 rounded-lg text-destructive flex items-center justify-center hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 pt-4 border-t border-slate-200 space-y-3">
          <div className="flex gap-2">
            {["Tunai", "Transfer", "QRIS"].map((m) => (
              <button key={m} onClick={() => setPayment(m)}
                data-testid={`pos-payment-${m.toLowerCase()}`}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${payment === m ? "bg-[#1B5E3B] text-white" : "border border-input hover:bg-secondary"}`}>
                {m}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Total</span>
            <span className="font-mono font-bold text-2xl text-[#1B5E3B]" data-testid="pos-total">{rupiah(total)}</span>
          </div>
          <button
            onClick={checkout} disabled={!cart.length || saving}
            data-testid="pos-checkout-button"
            className="w-full bg-[#C85A32] hover:bg-[#B04B26] text-white py-3 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Bayar
          </button>
        </div>

        {lastInvoice && (
          <div className="mt-4 p-3 rounded-xl bg-green-50 border border-green-200 text-sm" data-testid="pos-last-invoice">
            <p className="font-semibold text-green-800">Transaksi terakhir: {lastInvoice.invoice_no}</p>
            <p className="font-mono text-green-700">{rupiah(lastInvoice.total)} • {lastInvoice.payment_method}</p>
            <button onClick={() => printReceipt(lastInvoice, logoUrl)} data-testid="pos-print-receipt-button"
              className="mt-2 w-full flex items-center justify-center gap-2 border border-green-300 text-green-800 py-2 rounded-lg text-sm font-semibold hover:bg-green-100">
              <Printer className="w-4 h-4" /> Cetak Struk PDF
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
