import { useEffect, useState, useRef } from "react";
import { api, apiError } from "@/lib/api";
import { rupiah, fmtDate, todayStr, CHANNEL_COLORS } from "@/lib/format";
import { exportEcomTemplate, readEcomExcel } from "@/lib/exporter";
import { Search, Plus, Minus, Trash2, ShoppingBag, Loader2, CheckCircle2, FileSpreadsheet, Upload } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { calcFees, saranOf } from "@/lib/fees";
import { usePricingTarget } from "@/lib/usePricingTarget";

const STATUSES = ["Diproses", "Dikirim", "Selesai", "Dikembalikan"];
const STATUS_STYLE = {
  "Diproses": "bg-slate-100 text-slate-700",
  "Dikirim": "bg-blue-100 text-blue-700",
  "Selesai": "bg-green-100 text-green-700",
  "Dikembalikan": "bg-red-100 text-red-700",
};

export default function PenjualanOnline() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const fileRef = useRef(null);
  const [products, setProducts] = useState([]);
  const [bundles, setBundles] = useState([]);
  const [channels, setChannels] = useState([]);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState([]);
  const [channel, setChannel] = useState("");
  const [adminFee, setAdminFee] = useState("");
  const [ongkir, setOngkir] = useState("");
  const [biayaLain, setBiayaLain] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [orderNo, setOrderNo] = useState("");
  const [date, setDate] = useState(todayStr());
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [recent, setRecent] = useState([]);
  const [filterMonth, setFilterMonth] = useState(todayStr().slice(0, 7));
  const [filterChannel, setFilterChannel] = useState("");

  const colorOf = (n) => channels.find((c) => c.name === n)?.color || CHANNEL_COLORS[n] || "#64748b";
  const activeChannels = channels.filter((c) => c.active);

  const loadProducts = () => api.get("/products").then((r) => setProducts(r.data));
  const loadBundles = () => api.get("/bundles").then((r) => setBundles(r.data));
  const loadRecent = () => api.get(`/ecommerce/sales?month=${filterMonth}${filterChannel ? `&channel=${encodeURIComponent(filterChannel)}` : ""}`).then((r) => setRecent(r.data));
  useEffect(() => {
    loadProducts(); loadBundles();
    api.get("/channels").then((r) => { setChannels(r.data); const act = r.data.filter((c) => c.active); if (act.length) setChannel(act[0].name); });
  }, []);
  useEffect(() => { loadRecent(); }, [filterMonth, filterChannel]);

  const sellable = [
    ...products,
    ...bundles.map((b) => ({ id: b.id, name: b.name, category: "Paket", harga_online: b.harga_online, harga_channel: b.harga_channel, hpp: b.hpp, stok: b.stok, stok_minimal: 0, is_bundle: true, hemat: b.hemat })),
  ];
  const priceFor = (p) => p.harga_channel?.[channel] || p.harga_online || 0;
  const target = usePricingTarget();
  const chFees = channels.find((c) => c.name === channel)?.fees || [];
  const saranFor = (p) => (p ? saranOf(chFees, p.harga_beli || p.hpp, target, p.category) : 0);
  const findSellable = (id) => sellable.find((x) => x.id === id);
  useEffect(() => {
    setCart((c) => c.map((i) => { const p = sellable.find((x) => x.id === i.product_id); return p ? { ...i, harga: priceFor(p) } : i; }));
  }, [channel]);
  const filtered = sellable.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) || (p.sku || "").toLowerCase().includes(search.toLowerCase()));

  const addToCart = (p) => {
    if (p.stok <= 0) { toast.error("Stok habis"); return; }
    setCart((c) => {
      const ex = c.find((i) => i.product_id === p.id);
      if (ex) {
        if (ex.qty >= p.stok) { toast.error("Melebihi stok"); return c; }
        return c.map((i) => i.product_id === p.id ? { ...i, qty: i.qty + 1 } : i);
      }
      return [...c, { product_id: p.id, name: p.name, harga: priceFor(p), qty: 1, stok: p.stok, is_bundle: !!p.is_bundle }];
    });
  };
  const setQty = (id, delta) => setCart((c) =>
    c.map((i) => i.product_id === id ? { ...i, qty: Math.max(1, Math.min(i.stok, i.qty + delta)) } : i));
  const setHarga = (id, v) => setCart((c) => c.map((i) => i.product_id === id ? { ...i, harga: Number(v) || 0 } : i));
  const removeItem = (id) => setCart((c) => c.filter((i) => i.product_id !== id));

  const omzet = cart.reduce((s, i) => s + i.qty * i.harga, 0);
  const autoFee = calcFees(channels.find((c) => c.name === channel)?.fees || [], omzet);
  const isAutoFee = adminFee === "";
  const effAdmin = isAutoFee ? autoFee.total : Number(adminFee) || 0;
  const totalFee = effAdmin + (Number(ongkir) || 0) + (Number(biayaLain) || 0);
  const estNet = omzet - totalFee;

  const submit = async () => {
    if (!channel) { toast.error("Pilih channel"); return; }
    if (!cart.length) { toast.error("Tambahkan produk dulu"); return; }
    setSaving(true);
    try {
      const { data } = await api.post("/ecommerce/sales", {
        channel,
        items: cart.map((i) => ({ product_id: i.product_id, name: i.name, qty: i.qty, harga: i.harga, is_bundle: !!i.is_bundle })),
        admin_fee: effAdmin,
        fee_breakdown: isAutoFee ? autoFee.items : [{ label: "Biaya admin (manual)", amount: effAdmin }],
        ongkir: Number(ongkir) || 0,
        biaya_lain: Number(biayaLain) || 0,
        customer_name: customerName,
        order_no: orderNo,
        date,
      });
      toast.success(`Penjualan ${channel} ${data.ecom_no} tersimpan (status: Diproses)`);
      setCart([]); setAdminFee(""); setOngkir(""); setBiayaLain(""); setCustomerName(""); setOrderNo("");
      loadProducts(); loadBundles(); loadRecent();
    } catch (err) {
      toast.error(apiError(err.response?.data?.detail));
    } finally { setSaving(false); }
  };

  const changeStatus = async (s, newStatus) => {
    if (newStatus === s.status) return;
    let restore = false;
    if (newStatus === "Dikembalikan") {
      restore = window.confirm("Kembalikan stok produk ke gudang?\n\nOK = stok dikembalikan, Batal = stok tidak dikembalikan.");
    }
    try {
      await api.put(`/ecommerce/sales/${s.id}/status`, { status: newStatus, restore_stock: restore });
      toast.success(`Status ${s.ecom_no} → ${newStatus}${restore ? " (stok dikembalikan)" : ""}`);
      loadProducts(); loadBundles(); loadRecent();
    } catch (err) { toast.error(apiError(err.response?.data?.detail)); }
  };

  const del = async (id) => {
    if (!window.confirm("Hapus penjualan ini? Stok akan dikembalikan.")) return;
    try { await api.delete(`/ecommerce/sales/${id}`); toast.success("Dihapus, stok dikembalikan"); loadProducts(); loadRecent(); }
    catch (err) { toast.error(apiError(err.response?.data?.detail)); }
  };

  const onImport = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setImporting(true);
    try {
      const rows = await readEcomExcel(f);
      if (!rows.length) { toast.error("File kosong atau format tidak sesuai template"); return; }
      const { data } = await api.post("/ecommerce/sales/bulk", { rows });
      if (data.created > 0) toast.success(`${data.created} penjualan diimpor`);
      if (data.errors?.length) toast.error(`${data.errors.length} baris gagal: ${data.errors.slice(0, 3).join("; ")}${data.errors.length > 3 ? "…" : ""}`);
      if (data.created === 0 && !data.errors?.length) toast.error("Tidak ada data yang diimpor");
      loadProducts(); loadBundles(); loadRecent();
    } catch (err) { toast.error("Gagal membaca file Excel"); }
    finally { setImporting(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex flex-wrap items-center gap-2" data-testid="ecom-channel-selector">
            {activeChannels.map((c) => (
              <button key={c.name} onClick={() => setChannel(c.name)} data-testid={`ecom-channel-${c.name.replace(/\s+/g, "-").toLowerCase()}`}
                className={`px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all ${channel === c.name ? "text-white border-transparent shadow-md" : "bg-card hover:bg-secondary border-input"}`}
                style={channel === c.name ? { backgroundColor: c.color } : {}}>
                {c.name}
              </button>
            ))}
            {activeChannels.length === 0 && <span className="text-sm text-muted-foreground">Belum ada channel aktif. Tambahkan di Pengaturan.</span>}
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
                <span className={`text-[10px] uppercase tracking-wider font-semibold ${p.is_bundle ? "text-[#2563EB]" : "text-[#C85A32]"}`}>{p.is_bundle ? "★ Paket Bundling" : p.category}</span>
                <p className="font-medium text-sm text-[#0F281E] mt-1 line-clamp-2 min-h-[2.5rem]">{p.name}</p>
                <div className="flex items-center justify-between mt-2">
                  <span className={`font-mono font-bold ${priceFor(p) ? "text-[#1B5E3B]" : "text-muted-foreground text-xs"}`}>{priceFor(p) ? rupiah(priceFor(p)) : "Harga online belum diatur"}</span>
                  <span className={`text-xs ${p.stok <= p.stok_minimal ? "text-destructive" : "text-muted-foreground"}`}>Stok: {p.stok}</span>
                </div>
                {saranFor(p) > 0 && (
                  <p className={`text-[11px] mt-1 font-semibold ${priceFor(p) < saranFor(p) ? "text-amber-600" : "text-[#2563EB]"}`} data-testid={`ecom-saran-${p.id}`}>
                    Saran {channel}: {rupiah(saranFor(p))}
                  </p>
                )}
                {p.is_bundle && p.hemat > 0 && <span className="inline-block mt-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">Hemat {rupiah(p.hemat)}</span>}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-card rounded-2xl border border-slate-200 p-5 h-fit lg:sticky lg:top-24">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-heading font-semibold text-lg text-[#0F281E] flex items-center gap-2"><ShoppingBag className="w-5 h-5" /> Pesanan</h3>
            {channel && <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-lg text-white" style={{ backgroundColor: colorOf(channel) }}>{channel}</span>}
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
                  {saranFor(findSellable(i.product_id)) > 0 && (() => {
                    const s = saranFor(findSellable(i.product_id));
                    return (
                      <div className="flex items-center justify-between text-[11px]" data-testid={`ecom-cart-saran-${i.product_id}`}>
                        <span className={i.harga < s ? "text-amber-600 font-semibold" : "text-muted-foreground"}>Saran: {rupiah(s)}{i.harga < s ? " (di bawah target)" : ""}</span>
                        {i.harga !== s && <button onClick={() => setHarga(i.product_id, s)} data-testid={`ecom-cart-use-saran-${i.product_id}`} className="text-[#2563EB] font-semibold">Pakai saran</button>}
                      </div>
                    );
                  })()}
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 pt-4 border-t border-slate-200 space-y-2.5">
            <div className="rounded-lg bg-secondary/50 p-2.5 text-xs space-y-1" data-testid="ecom-fee-breakdown">
              <div className="flex items-center justify-between font-semibold text-[#0F281E]">
                <span>Potongan {channel || "platform"} {isAutoFee ? "(otomatis)" : "(manual)"}</span>
                {!isAutoFee && <button onClick={() => setAdminFee("")} data-testid="ecom-fee-auto-reset" className="text-[#2563EB] font-semibold">Pakai otomatis</button>}
              </div>
              {isAutoFee && (autoFee.items.length ? autoFee.items.map((f, i) => (
                <div key={i} className="flex justify-between text-muted-foreground"><span>{f.label}</span><span className="font-mono">-{rupiah(f.amount)}</span></div>
              )) : <p className="text-muted-foreground">Belum ada potongan untuk channel ini (atur di Pengaturan).</p>)}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <input type="number" value={adminFee} onChange={(e) => setAdminFee(e.target.value)} data-testid="ecom-admin-fee" placeholder={`Potongan: ${autoFee.total}`} title="Kosongkan untuk potongan otomatis" className="px-2 py-2 rounded-lg border border-input text-xs" />
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
          <div className="flex flex-wrap gap-2">
            {isAdmin && (
              <>
                <button onClick={exportEcomTemplate} data-testid="ecom-template-button" className="flex items-center gap-2 px-3 py-2 rounded-xl border border-input text-sm hover:bg-secondary"><FileSpreadsheet className="w-4 h-4" /> Template</button>
                <label data-testid="ecom-import-label" className="flex items-center gap-2 px-3 py-2 rounded-xl border border-input text-sm hover:bg-secondary cursor-pointer">
                  {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Impor Excel
                  <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={onImport} className="hidden" data-testid="ecom-import-input" />
                </label>
              </>
            )}
            <select value={filterChannel} onChange={(e) => setFilterChannel(e.target.value)} data-testid="ecom-filter-channel" className="px-3 py-2 rounded-xl border border-input text-sm bg-card">
              <option value="">Semua channel</option>
              {channels.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
            <input type="month" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} data-testid="ecom-filter-month" className="px-3 py-2 rounded-xl border border-input text-sm" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-200 bg-secondary/50 text-left">
              <th className="px-3 py-2.5 font-semibold">No</th><th className="px-3 py-2.5 font-semibold">Channel</th><th className="px-3 py-2.5 font-semibold">Tanggal</th>
              <th className="px-3 py-2.5 font-semibold text-right">Omzet</th><th className="px-3 py-2.5 font-semibold text-right">Biaya</th>
              <th className="px-3 py-2.5 font-semibold text-right">Laba Bersih</th><th className="px-3 py-2.5 font-semibold text-center">Status</th>{isAdmin && <th className="px-3 py-2.5 font-semibold text-center">Aksi</th>}
            </tr></thead>
            <tbody>
              {recent.length === 0 && <tr><td colSpan={isAdmin ? 8 : 7} className="px-3 py-8 text-center text-muted-foreground">Belum ada penjualan online.</td></tr>}
              {recent.map((s) => (
                <tr key={s.id} className="border-b border-slate-100" data-testid={`ecom-row-${s.id}`}>
                  <td className="px-3 py-2.5 font-mono text-xs">{s.ecom_no}</td>
                  <td className="px-3 py-2.5"><span className="text-xs px-2 py-1 rounded-lg text-white font-semibold" style={{ backgroundColor: colorOf(s.channel) }}>{s.channel}</span></td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">{fmtDate(s.created_at)}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{rupiah(s.omzet)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-destructive">{rupiah(s.total_fee)}</td>
                  <td className="px-3 py-2.5 text-right font-mono font-semibold text-[#1B5E3B]">{rupiah(s.laba_bersih)}</td>
                  <td className="px-3 py-2.5 text-center">
                    {isAdmin ? (
                      <select value={s.status || "Diproses"} onChange={(e) => changeStatus(s, e.target.value)} data-testid={`ecom-status-${s.id}`}
                        className={`text-xs px-2 py-1 rounded-lg font-semibold border-0 cursor-pointer ${STATUS_STYLE[s.status] || STATUS_STYLE.Diproses}`}>
                        {STATUSES.map((st) => <option key={st} value={st}>{st}</option>)}
                      </select>
                    ) : (
                      <span className={`text-xs px-2 py-1 rounded-lg font-semibold ${STATUS_STYLE[s.status] || STATUS_STYLE.Diproses}`}>{s.status || "Diproses"}</span>
                    )}
                  </td>
                  {isAdmin && <td className="px-3 py-2.5 text-center"><button onClick={() => del(s.id)} data-testid={`ecom-delete-${s.id}`} className="text-destructive"><Trash2 className="w-4 h-4" /></button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground mt-3">Hanya pesanan berstatus <span className="font-semibold text-green-700">Selesai</span> yang dihitung ke Laba Rugi, Dashboard, dan laporan harian/bulanan/tahunan.</p>
      </div>
    </div>
  );
}
