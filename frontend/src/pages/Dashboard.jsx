import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { rupiah, fmtDateTime } from "@/lib/format";
import { TrendingUp, ShoppingCart, Package, AlertTriangle, Loader2 } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

function Stat({ label, value, icon: Icon, accent, testid }) {
  return (
    <div className="bg-card rounded-2xl border border-slate-200 p-5" data-testid={testid}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${accent}`}>
          <Icon className="w-[18px] h-[18px] text-white" />
        </div>
      </div>
      <p className="font-mono font-bold text-2xl text-[#0F281E]">{value}</p>
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);

  useEffect(() => { api.get("/dashboard").then((r) => setData(r.data)); }, []);

  if (!data) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-[#1B5E3B]" /></div>;

  const chartData = data.series7.map((s) => ({ ...s, label: s.date.slice(5) }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Omzet Hari Ini" value={rupiah(data.today.total_omzet)} icon={TrendingUp} accent="bg-[#1B5E3B]" testid="stat-omzet-today" />
        <Stat label="Transaksi Hari Ini" value={data.today.jumlah_transaksi} icon={ShoppingCart} accent="bg-[#C85A32]" testid="stat-tx-today" />
        <Stat label="Total Produk" value={data.total_produk} icon={Package} accent="bg-[#D97706]" testid="stat-total-produk" />
        <Stat label="Stok Menipis" value={data.low_stock.length} icon={AlertTriangle} accent="bg-destructive" testid="stat-low-stock" />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-card rounded-2xl border border-slate-200 p-6">
          <h3 className="font-heading font-semibold text-lg text-[#0F281E] mb-4">Penjualan 7 Hari Terakhir</h3>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#1B5E3B" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#1B5E3B" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f0" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v / 1000}k`} />
              <Tooltip formatter={(v) => rupiah(v)} />
              <Area type="monotone" dataKey="omzet" stroke="#1B5E3B" strokeWidth={2} fill="url(#g1)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card rounded-2xl border border-slate-200 p-6">
          <h3 className="font-heading font-semibold text-lg text-[#0F281E] mb-4">Produk Terlaris Hari Ini</h3>
          {data.top_products.length === 0 && <p className="text-sm text-muted-foreground">Belum ada penjualan hari ini.</p>}
          <div className="space-y-3">
            {data.top_products.map((p, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-6 h-6 rounded-lg bg-secondary text-[#1B5E3B] text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                  <span className="text-sm truncate">{p.name}</span>
                </div>
                <span className="font-mono text-sm font-semibold text-[#1B5E3B]">{rupiah(p.omzet)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-slate-200 p-6">
        <h3 className="font-heading font-semibold text-lg text-[#0F281E] mb-4 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-destructive" /> Peringatan Stok Menipis
        </h3>
        {data.low_stock.length === 0 ? (
          <p className="text-sm text-muted-foreground">Semua stok aman.</p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.low_stock.map((p) => (
              <div key={p.id} className="flex items-center justify-between p-3 rounded-xl bg-red-50 border border-red-100" data-testid={`low-stock-${p.id}`}>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{p.name}</p>
                  <p className="text-xs text-muted-foreground">Min: {p.stok_minimal} {p.unit}</p>
                </div>
                <span className="font-mono font-bold text-destructive">{p.stok}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
