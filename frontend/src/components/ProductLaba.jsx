import { rupiah } from "@/lib/format";
import { TrendingUp, TrendingDown } from "lucide-react";

function LabaCard({ title, items, icon: Icon, color, testid }) {
  return (
    <div className="bg-card rounded-2xl border border-slate-200 p-6" data-testid={testid}>
      <h3 className="font-heading font-semibold text-lg mb-4 flex items-center gap-2" style={{ color }}>
        <Icon className="w-5 h-5" /> {title}
      </h3>
      {(!items || items.length === 0) ? <p className="text-sm text-muted-foreground">Belum ada data.</p> : (
        <div className="space-y-3">
          {items.map((p, i) => (
            <div key={i} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{p.name}</p>
                <p className="text-xs text-muted-foreground">{p.qty} terjual • omzet {rupiah(p.omzet)}</p>
              </div>
              <span className="font-mono text-sm font-bold shrink-0" style={{ color }}>{rupiah(p.laba)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ProductLaba({ data }) {
  if (!data) return null;
  return (
    <div className="grid lg:grid-cols-2 gap-6" data-testid="product-laba">
      <LabaCard title="Laba Tertinggi" items={data.tertinggi} icon={TrendingUp} color="#16A34A" testid="product-laba-tertinggi" />
      <LabaCard title="Laba Terendah" items={data.terendah} icon={TrendingDown} color="#C85A32" testid="product-laba-terendah" />
    </div>
  );
}
