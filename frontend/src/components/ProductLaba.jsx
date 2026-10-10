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

export function CategoryLaba({ data }) {
  if (!data || data.length === 0) return null;
  return (
    <div className="bg-card rounded-2xl border border-slate-200 p-6" data-testid="category-laba">
      <h3 className="font-heading font-semibold text-lg mb-4">Laba Kotor per Kategori</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-secondary/50 text-left">
              <th className="px-4 py-2.5 font-semibold">Kategori</th>
              <th className="px-4 py-2.5 font-semibold text-right">Omzet</th>
              <th className="px-4 py-2.5 font-semibold text-right">Laba Kotor</th>
              <th className="px-4 py-2.5 font-semibold text-right">Margin</th>
            </tr>
          </thead>
          <tbody>
            {data.map((c, i) => (
              <tr key={i} className="border-b border-slate-100" data-testid={`category-laba-row-${c.category}`}>
                <td className="px-4 py-2.5 font-medium">{c.category}</td>
                <td className="px-4 py-2.5 text-right font-mono">{rupiah(c.omzet)}</td>
                <td className="px-4 py-2.5 text-right font-mono font-semibold text-[#1B5E3B]">{rupiah(c.laba)}</td>
                <td className="px-4 py-2.5 text-right font-mono text-muted-foreground">{c.omzet ? ((c.laba / c.omzet) * 100).toFixed(1) : 0}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
