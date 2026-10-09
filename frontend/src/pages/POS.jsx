import { useEffect, useState } from "react";
import { api, apiError } from "@/lib/api";
import { rupiah } from "@/lib/format";
import { Search, Plus, Minus, Trash2, ShoppingCart, Loader2, CheckCircle2, Printer, Users, User } from "lucide-react";
import { toast } from "sonner";
import { printReceipt } from "@/lib/exporter";
import { useSettings } from "@/context/SettingsContext";

export default function POS() {
  const { settings } = useSettings();
  const logoUrl = settings?.has_logo ? `${process.env.REACT_APP_BACKEND_URL}/api/settings/logo?v=${encodeURIComponent(settings.logo_updated || "")}` : undefined;
  const storeInfo = { store_name: settings?.store_name, address: settings?.address, phone: settings?.phone };
  const [products, setProducts] = useState([]);
  const [bundles, setBundles] = useState([]);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState([]);
  const [payment, setPayment] = useState("Tunai");
  const [priceMode, setPriceMode] = useState("normal");
  const [saving, setSaving] = useState(false);
  const [lastInvoice, setLastInvoice] = useState(null);
  const [customerName, setCustomerName] = useState("");
  const [discRp, setDiscRp] = useState("");
  const [discPct, setDiscPct] = useState("");
  const [discReason, setDiscReason] = useState("");
  const [isHutang, setIsHutang] = useState(false);
  const [amountPaid, setAmountPaid] = useState("");

  const priceOf = (p) => (priceMode === "reseller" ? (p.harga_reseller || p.harga_jual) : p.harga_jual);

  const load = () => Promise.all([api.get("/products"), api.get("/bundles")]).then(([p, b]) => { setProducts(p.data); setBundles(b.data); });
  useEffect(() => { load(); }, []);

  // Sync cart prices when switching price mode
  useEffect(() => {
    setCart((c) => c.map((i) => {
      const p = products.find((pr) => pr.id === i.product_id);
      return p ? { ...i, harga: priceOf(p) } : i;
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceMode]);

  const sellable = [
    ...products,
    ...bundles.map((b) => ({ id: b.id, name: b.name, category: "Paket", harga_jual: b.harga_jual, harga_reseller: b.harga_reseller, stok: b.stok, stok_minimal: 0, is_bundle: true, hemat: b.hemat })),
  ];
  const filtered = sellable.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) || (p.sku || "").toLowerCase().includes(search.toLowerCase())
  );

  const addToCart = (p) => {
    if (p.stok <= 0) { toast.error("Stok habis"); return; }
    setCart((c) => {
      const ex = c.find((i) => i.product_id === p.id);
      if (ex) {
        if (ex.qty >= p.stok) { toast.error("Melebihi stok"); return c; }
        return c.map((i) => i.product_id === p.id ? { ...i, qty: i.qty + 1 } : i);
      }
      return [...c, { product_id: p.id, name: p.name, harga: priceOf(p), qty: 1, stok: p.stok, is_bundle: !!p.is_bundle }];
    });
  };

  const setQty = (id, delta) => setCart((c) =>
    c.map((i) => i.product_id === id ? { ...i, qty: Math.max(1, Math.min(i.stok, i.qty + delta)) } : i));

  const removeItem = (id) => setCart((c) => c.filter((i) => i.product_id !== id));

  const subtotal = cart.reduce((s, i) => s + i.qty * i.harga, 0);
  const discount = Math.min(subtotal, (Number(discRp) || 0) + Math.round(subtotal * (Number(discPct) || 0) / 100));
  const total = subtotal - discount;
  const paid = isHutang ? (Number(amountPaid) || 0) : total;

  const checkout = async () => {
    if (!cart.length) return;
    setSaving(true);
    try {
      const { data } = await api.post("/transactions", {
        items: cart.map((i) => ({ product_id: i.product_id, name: i.name, qty: i.qty, harga: i.harga, is_bundle: !!i.is_bundle })),
        payment_method: payment,
        discount,
        discount_reason: discReason,
        customer_name: customerName,
        amount_paid: isHutang ? paid : null,
      });
      setLastInvoice(data);
      toast.success(`Transaksi ${data.invoice_no} berhasil!`);
      printReceipt(data, logoUrl, storeInfo);
      setCart([]); setCustomerName(""); setDiscRp(""); setDiscPct(""); setDiscReason(""); setIsHutang(false); setAmountPaid("");
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
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              data-testid="pos-search-product-input"
              placeholder="Cari produk / SKU..."
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-input bg-card focus:outline-none focus:ring-2 focus:ring-[#1B5E3B] text-sm"
            />
          </div>
          <div className="flex rounded-xl border border-input overflow-hidden" data-testid="pos-price-mode">
            <button onClick={() => setPriceMode("normal")} data-testid="pos-price-normal"
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold transition-colors ${priceMode === "normal" ? "bg-[#1B5E3B] text-white" : "bg-card hover:bg-secondary"}`}>
              <User className="w-3.5 h-3.5" /> Normal
            </button>
            <button onClick={() => setPriceMode("reseller")} data-testid="pos-price-reseller"
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold transition-colors ${priceMode === "reseller" ? "bg-[#C85A32] text-white" : "bg-card hover:bg-secondary"}`}>
              <Users className="w-3.5 h-3.5" /> Reseller
            </button>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((p) => (
            <button
              key={p.id} onClick={() => addToCart(p)} disabled={p.stok <= 0}
              data-testid={`pos-product-${p.id}`}
              className="text-left bg-card rounded-xl border border-slate-200 p-4 hover:border-[#1B5E3B] hover:shadow-md transition-all disabled:opacity-50"
            >
              <span className={`text-[10px] uppercase tracking-wider font-semibold ${p.is_bundle ? "text-[#2563EB]" : "text-[#C85A32]"}`}>{p.is_bundle ? "★ Paket Bundling" : p.category}</span>
              <p className="font-medium text-sm text-[#0F281E] mt-1 line-clamp-2 min-h-[2.5rem]">{p.name}</p>
              <div className="flex items-center justify-between mt-2">
                <span className={`font-mono font-bold ${priceMode === "reseller" ? "text-[#C85A32]" : "text-[#1B5E3B]"}`}>{rupiah(priceOf(p))}</span>
                <span className={`text-xs ${p.stok <= p.stok_minimal ? "text-destructive" : "text-muted-foreground"}`}>Stok: {p.stok}</span>
              </div>
              {p.is_bundle && p.hemat > 0 && <span className="inline-block mt-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">Hemat {rupiah(p.hemat)}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-slate-200 p-5 h-fit lg:sticky lg:top-24">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-heading font-semibold text-lg text-[#0F281E] flex items-center gap-2">
            <ShoppingCart className="w-5 h-5" /> Keranjang
          </h3>
          <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-lg ${priceMode === "reseller" ? "bg-orange-100 text-[#C85A32]" : "bg-green-100 text-[#1B5E3B]"}`}>
            Harga {priceMode === "reseller" ? "Reseller" : "Normal"}
          </span>
        </div>
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
          <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} data-testid="pos-customer-input"
            placeholder="Nama pelanggan (opsional)"
            className="w-full px-3 py-2 rounded-lg border border-input text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5E3B]" />
          <div className="flex gap-2">
            <input type="number" value={discRp} onChange={(e) => setDiscRp(e.target.value)} data-testid="pos-discount-rp" placeholder="Diskon Rp"
              className="w-1/2 px-3 py-2 rounded-lg border border-input text-sm" />
            <input type="number" value={discPct} onChange={(e) => setDiscPct(e.target.value)} data-testid="pos-discount-pct" placeholder="Diskon %"
              className="w-1/2 px-3 py-2 rounded-lg border border-input text-sm" />
          </div>
          {(discRp || discPct) && (
            <input value={discReason} onChange={(e) => setDiscReason(e.target.value)} data-testid="pos-discount-reason" placeholder="Alasan diskon"
              className="w-full px-3 py-2 rounded-lg border border-input text-sm" />
          )}
          <div className="flex gap-2">
            {["Tunai", "Transfer", "QRIS"].map((m) => (
              <button key={m} onClick={() => setPayment(m)}
                data-testid={`pos-payment-${m.toLowerCase()}`}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${payment === m ? "bg-[#1B5E3B] text-white" : "border border-input hover:bg-secondary"}`}>
                {m}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={isHutang} onChange={(e) => setIsHutang(e.target.checked)} data-testid="pos-hutang-check" /> Bayar sebagian / Piutang</label>
          {isHutang && (
            <input type="number" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} data-testid="pos-amount-paid" placeholder="Jumlah dibayar sekarang"
              className="w-full px-3 py-2 rounded-lg border border-input text-sm" />
          )}
          {discount > 0 && (
            <div className="text-sm text-muted-foreground space-y-0.5">
              <div className="flex justify-between"><span>Subtotal</span><span className="font-mono">{rupiah(subtotal)}</span></div>
              <div className="flex justify-between text-destructive"><span>Diskon</span><span className="font-mono">-{rupiah(discount)}</span></div>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Total</span>
            <span className="font-mono font-bold text-2xl text-[#1B5E3B]" data-testid="pos-total">{rupiah(total)}</span>
          </div>
          {isHutang && <p className="text-xs text-[#C85A32] text-right" data-testid="pos-sisa">Sisa piutang: {rupiah(Math.max(0, total - paid))}</p>}
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
            <button onClick={() => printReceipt(lastInvoice, logoUrl, storeInfo)} data-testid="pos-print-receipt-button"
              className="mt-2 w-full flex items-center justify-center gap-2 border border-green-300 text-green-800 py-2 rounded-lg text-sm font-semibold hover:bg-green-100">
              <Printer className="w-4 h-4" /> Cetak Struk PDF
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
