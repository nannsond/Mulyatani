import { useState } from "react";
import { Search } from "lucide-react";
import { rupiah } from "@/lib/format";

export default function ProductSearchPicker({ products, excludeIds = [], onPick }) {
  const [q, setQ] = useState("");
  const term = q.trim().toLowerCase();
  const results = term ? products.filter((p) => !excludeIds.includes(p.id) && p.name.toLowerCase().includes(term)).slice(0, 8) : [];
  const pick = (p) => { onPick(p.id); setQ(""); };

  return (
    <div className="relative mt-2" data-testid="bundle-comp-search">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari produk satuan untuk ditambahkan..." data-testid="bundle-comp-search-input"
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (results[0]) pick(results[0]); } }}
        className="w-full pl-9 pr-3 py-2 rounded-lg border border-input text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5E3B]" />
      {term && (
        <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-y-auto" data-testid="bundle-comp-search-results">
          {results.length === 0 && <p className="px-3 py-2 text-sm text-muted-foreground" data-testid="bundle-comp-search-empty">Produk tidak ditemukan</p>}
          {results.map((p) => (
            <button type="button" key={p.id} onClick={() => pick(p)} data-testid={`bundle-comp-option-${p.id}`}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-secondary">
              <span className="truncate">{p.name}</span>
              <span className="shrink-0 text-xs font-mono text-muted-foreground">{rupiah(p.harga_beli || 0)} · stok {p.stok}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
