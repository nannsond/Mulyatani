import { useState } from "react";
import { rupiah } from "@/lib/format";

export default function PlatformLogisticsTable({ channel, table }) {
  const [svc, setSvc] = useState(table.services[0]?.name);
  const current = table.services.find((s) => s.name === svc);
  return (
    <div className="space-y-2 pt-2 border-t border-slate-100" data-testid={`platform-logistics-${channel.replace(/\s+/g, "-").toLowerCase()}`}>
      <p className="text-sm font-semibold text-[#0F281E]">Biaya Layanan Logistik {channel} (per pesanan, termasuk PPN)</p>
      <p className="text-xs text-muted-foreground">Dipakai otomatis untuk estimasi ongkir pesanan {channel} berdasarkan layanan, rute, dan tingkatan berat paket.</p>
      <div className="flex flex-wrap gap-1.5">
        {table.services.map((s) => (
          <button key={s.name} onClick={() => setSvc(s.name)} data-testid={`platform-logistics-tab-${s.name.replace(/\W+/g, "-").toLowerCase()}`}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${svc === s.name ? "bg-[#1B5E3B] text-white border-transparent" : "border-input hover:bg-secondary"}`}>{s.name}</button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-secondary/50 text-left">
              <th className="px-2 py-2 font-semibold">Rute</th>
              {table.tiers.map((t) => <th key={t} className="px-2 py-2 font-semibold text-right whitespace-nowrap">{t}</th>)}
            </tr>
          </thead>
          <tbody>
            {current?.routes.map((r) => (
              <tr key={r.zona_a + r.zona_b} className="border-b border-slate-100">
                <td className="px-2 py-1.5 whitespace-nowrap">{r.zona_a} ↔ {r.zona_b}</td>
                {r.fees.map((f, i) => <td key={i} className="px-2 py-1.5 text-right font-mono">{f == null ? "N.A." : rupiah(f)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
