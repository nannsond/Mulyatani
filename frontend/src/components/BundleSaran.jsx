import { rupiah } from "@/lib/format";
import { saranOf } from "@/lib/fees";
import { Wand2 } from "lucide-react";

const slug = (s) => s.replace(/\s+/g, "-").toLowerCase();

export default function BundleSaran({ cost, channels = [], pricingTarget, price = 0, onUse, testid }) {
  if (!(cost > 0) || !channels.length) return null;
  const list = channels.map((c) => ({ c, s: saranOf(c.fees, cost, pricingTarget, "Paket") }));
  const max = Math.max(...list.map((x) => x.s));
  return (
    <div className="rounded-lg bg-blue-50/60 border border-blue-100 p-2 text-xs space-y-1" data-testid={testid}>
      <div className="flex items-center justify-between font-semibold text-[#2563EB]">
        <span className="flex items-center gap-1"><Wand2 className="w-3.5 h-3.5" /> Saran harga online (modal {rupiah(cost)})</span>
        {onUse && price !== max && (
          <button type="button" onClick={() => onUse(max)} data-testid={`${testid}-use`} className="underline">Pakai {rupiah(max)}</button>
        )}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        {list.map(({ c, s }) => (
          <span key={c.name} data-testid={`${testid}-${slug(c.name)}`}>
            <span style={{ color: c.color }} className="font-semibold">{c.name}</span>{" "}
            <span className={`font-mono ${price > 0 && price < s ? "text-amber-600 font-semibold" : ""}`}>{rupiah(s)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
