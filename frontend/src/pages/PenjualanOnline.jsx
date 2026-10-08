import { useEffect, useState } from "react";
import { api, apiError } from "@/lib/api";
import { rupiah, fmtDate, todayStr, ECOM_CHANNELS, CHANNEL_COLORS } from "@/lib/format";
import { Search, Plus, Minus, Trash2, ShoppingBag, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";

export default function PenjualanOnline() {
  const { user } = useAuth();
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState([]);
  const [channel, setChannel] = useState("Shopee");
  const [adminFee, setAdminFee] = useState("");
  const [ongkir, setOngkir] = useState("");
  const [biayaLain, setBiayaLain] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [orderNo, setOrderNo] = useState("");
  const [date, setDate] = useState(todayStr());
  const [saving, setSaving] = useState(false);
  const [recent, setRecent] = useState([]);
  const [filterMonth, setFilterMonth] = useState(todayStr().slice(0, 7));
  const [filterChannel, setFilterChannel] = useState("");

  const loadProducts = () => api.get("/products").then((r) => setProducts(r.data));
  const loadRecent = () => api.get(`/ecommerce/sales?month=${filterMonth}${filterChannel ? `&channel=${encodeURIComponent(filterChannel)}` : ""}`).then((r) => setRecent(r.data));
  useEffect(() => { loadProducts(); }, []);
  useEffect(() => { loadRecent(); }, [filterMonth, filterChannel]);

  const filtered = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase()));

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
  const setHarga = (id, v) => setCart((c) => c.map((i) => i.product_id === id ? { ...i, harga: Number(v) || 0 } : i));
  const removeItem = (id) => setCart((c) => c.filter((i) => i.product_id !== id));

  const omzet = cart.reduce((s, i) => s + i.qty * i.harga, 0);
  const totalFee = (Number(adminFee) || 0) + (Number(ongkir) || 0) + (Number(biayaLain) || 0);
  const estNet = omzet - totalFee;

  const submit = async () => {
    if (!cart.length) { toast.error("Tambahkan produk dulu"); return; }
    setSaving(true);
    try {
      const { data } = await api.post("/ecommerce/sales", {
        channel,
        items: cart.map((i) => ({ product_id: i.product_id, name: i.name, qty: i.qty, harga: i.harga })),
        admin_fee: Number(adminFee) || 0,
        ongkir: Number(ongkir) || 0,
        biaya_lain: Number(biayaLain) || 0,
        customer_name: customerName,
        order_no: orderNo,
        date,
      });
      toast.success(`Penjualan ${channel} ${data.ecom_no} tersimpan!`);
      setCart([]); setAdminFee(""); setOngkir(""); setBiayaLain(""); setCustomerName(""); setOrderNo("");
      loadProducts(); loadRecent();
    } catch (err) {
      toast.error(apiError(err.response?.data?.detail));
    } finally { setSaving(false); }
  };

  const del = async (id) => {
    if (!window.confirm("Hapus penjualan ini? Stok akan dikembalikan.")) return;
    try { await api.delete(`/ecommerce/sales/${id}`); toast.success("Dihapus, stok dikembalikan"); loadProducts(); loadRecent(); }
    catch (err) { toast.error(apiError(err.response?.data?.detail)); }
  };

  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex flex-wrap gap-2" data-testid="ecom-channel-selector">
            {ECOM_CHANNELS.map((c) => (
              <button key={c} onClick={() => setChannel(c)} data-testid={`ecom-channel-${c.replace(/\s+/g, "-").toLowerCase()}`}
                className={`px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all ${channel === c ? "text-white border-transparent shadow-md" : "bg-card hover:bg-secondary border-input"}`}
                style={channel === c ? { backgroundColor: CHANNEL_COLORS[c] } : {}}>
                {c}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} data-testid="ecom-search-product-input"
              placeholder="Cari produk / SKU..." className="w-full pl-10 pr-4 py-3 rounded-xl border border-input bg-card focus:outline-none focus:ring-2 focus:ring-[#1B5E3B] text-sm" />
          </div>
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map((p) => (
              <button key={p.id} onClick={() => addToCart(p)} disabled={p.stok <= 0} data-testid={`ecom-product-${p.id}`}
                className="text-left bg-card rounded-xl border border-slate-200 p-4 hover:border-[#1B5E3B] hover:shadow-md transition-all disabled:opacity-50">
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
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-heading font-semibold text-lg text-[#0F281E] flex items-center gap-2"><ShoppingBag className="w-5 h-5" /> Pesanan</h3>
            <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-lg text-white" style={{ backgroundColor: CHANNEL_COLORS[channel] }}>{channel}</span>
          </div>
          {cart.length === 0 ? <p className="text-sm text-muted-foreground py-8 text-center">Belum ada item.</p> : (
            <div className="space-y-3 max-h-[35vh] overflow-y-auto">
              {cart.map((i) => (
                <div key={i.product_id} className="space-y-1.5" data-testid={`ecom-cart-item-${i.product_id}`}>
                  <div className="flex items-center gap-2">
                    <p className="flex-1 min-w-0 text-sm font-medium truncate">{i.name}</p>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setQty(i.product_id, -1)} className="w-7 h-7 rounded-lg border flex items-center justify-center hover:bg-secondary"><Minus className="w-3 h-3" /></button>
                      <span className="w-7 text-center text-sm font-mono">{i.qty}</span>
                      <button onClick={() => setQty(i.product_id, 1)} className="w-7 h-7 rounded-lg border flex items-center justify-center hover:bg-secondary"><Plus className="w-3 h-3" /></button>
                      <button onClick={() => removeItem(i.product_id)} className="w-7 h-7 rounded-lg text-destructive flex items-center justify-center hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                  <input type="number" value={i.harga} onChange={(e) => setHarga(i.product_id, e.target.value)} data-testid={`ecom-price-${i.product_id}`}
                    className="w-full px-2 py-1.5 rounded-lg border border-input text-xs font-mono" placeholder="Harga jual" />
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 pt-4 border-t border-slate-200 space-y-2.5">
            <div className="grid grid-cols-3 gap-2">
              <input type="number" value={adminFee} onChange={(e) => setAdminFee(e.target.value)} data-testid="ecom-admin-fee" placeholder="Biaya admin" className="px-2 py-2 rounded-lg border border-input text-xs" />
              <input type="number" value={ongkir} onChange={(e) => setOngkir(e.target.value)} data-testid="ecom-ongkir" placeholder="Ongkir" className="px-2 py-2 rounded-lg border border-input text-xs" />
              <input type="number" value={biayaLain} onChange={(e) => setBiayaLain(e.target.value)} data-testid="ecom-biaya-lain" placeholder="Biaya lain" className="px-2 py-2 rounded-lg border border-input text-xs" />
            </div>
            <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} data-testid="ecom-customer" placeholder="Nama pembeli (opsional)" className="w-full px-3 py-2 rounded-lg border border-input text-sm" />
            <div className="flex gap-2">
              <input value={orderNo} onChange={(e) => setOrderNo(e.target.value)} data-testid="ecom-order-no" placeholder="No. pesanan (opsional)" className="w-1/2 px-3 py-2 rounded-lg border border-input text-sm" />
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="ecom-date" className="w-1/2 px-3 py-2 rounded-lg border border-input text-sm" />
            </div>
            <div className="space-y-1 text-sm pt-1">
              <div className="flex justify-between text-muted-foreground"><span>Omzet</span><span className="font-mono">{rupiah(omzet)}</span></div>
              <div className="flex justify-between text-destructive"><span>Total biaya</span><span className="font-mono">-{rupiah(totalFee)}</span></div>
              <div className="flex items-center justify-between pt-1"><span className="font-medium">Est. diterima</span><span className="font-mono font-bold text-xl text-[#1B5E3B]" data-testid="ecom-net">{rupiah(estNet)}</span></div>
            </div>
            <button onClick={submit} disabled={!cart.length || saving} data-testid="ecom-submit-button"
              className="w-full bg-[#C85A32] hover:bg-[#B04B26] text-white py-3 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Simpan Penjualan
            </button>
          </div>
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-slate-200 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h3 className="font-heading font-semibold text-lg">Penjualan Online Terbaru</h3>
          <div className="flex gap-2">
            <select value={filterChannel} onChange={(e) => setFilterChannel(e.target.value)} data-testid="ecom-filter-channel" className="px-3 py-2 rounded-xl border border-input text-sm bg-card">
              <option value="">Semua channel</option>
              {ECOM_CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input type="month" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} data-testid="ecom-filter-month" className="px-3 py-2 rounded-xl border border-input text-sm" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-200 bg-secondary/50 text-left">
              <th className="px-3 py-2.5 font-semibold">No</th><th className="px-3 py-2.5 font-semibold">Channel</th><th className="px-3 py-2.5 font-semibold">Tanggal</th>
              <th className="px-3 py-2.5 font-semibold text-right">Omzet</th><th className="px-3 py-2.5 font-semibold text-right">Biaya</th>
              <th className="px-3 py-2.5 font-semibold text-right">Laba Bersih</th>{user?.role === "admin" && <th className="px-3 py-2.5 font-semibold text-center">Aksi</th>}
            </tr></thead>
            <tbody>
              {recent.length === 0 && <tr><td colSpan={user?.role === "admin" ? 7 : 6} className="px-3 py-8 text-center text-muted-foreground">Belum ada penjualan online.</td></tr>}
              {recent.map((s) => (
                <tr key={s.id} className="border-b border-slate-100" data-testid={`ecom-row-${s.id}`}>
                  <td className="px-3 py-2.5 font-mono text-xs">{s.ecom_no}</td>
                  <td className="px-3 py-2.5"><span className="text-xs px-2 py-1 rounded-lg text-white font-semibold" style={{ backgroundColor: CHANNEL_COLORS[s.channel] || "#64748b" }}>{s.channel}</span></td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">{fmtDate(s.created_at)}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{rupiah(s.omzet)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-destructive">{rupiah(s.total_fee)}</td>
                  <td className="px-3 py-2.5 text-right font-mono font-semibold text-[#1B5E3B]">{rupiah(s.laba_bersih)}</td>
                  {user?.role === "admin" && <td className="px-3 py-2.5 text-center"><button onClick={() => del(s.id)} data-testid={`ecom-delete-${s.id}`} className="text-destructive"><Trash2 className="w-4 h-4" /></button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
