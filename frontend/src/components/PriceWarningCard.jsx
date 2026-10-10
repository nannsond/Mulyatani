import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { rupiah } from "@/lib/format";
import { saranOf } from "@/lib/fees";
import { usePricingTarget } from "@/lib/usePricingTarget";
import { TrendingDown } from "lucide-react";

export default function PriceWarningCard() {
  const target = usePricingTarget();
  const [data, setData] = useState(null);
  useEffect(() => {
    Promise.all([api.get("/products"), api.get("/bundles"), api.get("/channels")]).then(([p, b, c]) =>
      setData({ products: p.data, bundles: b.data, channels: c.data.filter((x) => x.active) }));
  }, []);
  if (!data || !target.loaded) return null;

  const items = [
    ...data.products.map((p) => ({ id: p.id, name: p.name, cost: p.harga_beli, cat: p.category, priceOf: (c) => p.harga_channel?.[c] || p.harga_online || 0 })),
    ...data.bundles.map((b) => ({ id: b.id, name: `${b.name} (Paket)`, cost: b.hpp, cat: "Paket", priceOf: (c) => b.harga_channel?.[c] || b.harga_online || 0 })),
  ];
  const warns = items.map((it) => ({
    ...it,
    below: data.channels.map((c) => ({ c, price: it.priceOf(c.name), saran: saranOf(c.fees, it.cost, target, it.cat) }))
      .filter((x) => x.price > 0 && x.saran > 0 && x.price < x.saran),
  })).filter((it) => it.below.length);

  return (
    <div className="bg-card rounded-2xl border border-slate-200 p-6" data-testid="price-warning-card">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h3 className="font-heading font-semibold text-lg text-[#0F281E] flex items-center gap-2">
          <TrendingDown className="w-5 h-5 text-amber-600" /> Harga Online di Bawah Saran
          {warns.length > 0 && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700" data-testid="price-warning-count">{warns.length}</span>}
        </h3>
        <Link to="/daftar-harga" className="text-sm font-semibold text-[#2563EB]" data-testid="price-warning-link">Atur di Daftar Harga →</Link>
      </div>
      {warns.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="price-warning-empty">Semua harga online sudah memenuhi target untung setelah potongan platform.</p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {warns.map((w) => (
            <div key={w.id} className="p-3 rounded-xl bg-amber-50 border border-amber-200" data-testid={`price-warning-${w.id}`}>
              <p className="text-sm font-medium truncate">{w.name}</p>
              <div className="mt-1 space-y-0.5">
                {w.below.map(({ c, price, saran }) => (
                  <div key={c.name} className="flex justify-between text-xs">
                    <span style={{ color: c.color }} className="font-semibold">{c.name}</span>
                    <span className="font-mono"><span className="text-destructive">{rupiah(price)}</span> → saran {rupiah(saran)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
