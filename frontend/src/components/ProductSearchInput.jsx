import { useState } from "react";

export function ProductSearchInput({ products, onSelect }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const q = query.trim().toLowerCase();
  const matches = q ? products.filter((p) => `${p.name} ${p.sku}`.toLowerCase().includes(q)).slice(0, 20) : [];

  const pick = (p) => { onSelect(p); setQuery(""); setOpen(false); };
  const onKeyDown = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const exact = products.find((p) => p.name.toLowerCase() === q || p.sku.toLowerCase() === q);
    if (exact || matches.length === 1) pick(exact || matches[0]);
  };

  return (
    <div className="relative">
      <input value={query} data-testid="stok-opname-product-input" placeholder="Ketik nama atau SKU produk, Enter untuk tambah"
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }} onKeyDown={onKeyDown}
        onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="mt-1 w-full px-3 py-2.5 rounded-xl border border-input text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5E3B]" />
      {open && q && (
        <div className="absolute z-20 mt-1 w-full max-h-60 overflow-auto bg-white border border-slate-200 rounded-xl shadow-lg" data-testid="stok-opname-product-suggestions">
          {matches.length === 0 && <div className="px-3 py-2 text-sm text-muted-foreground">Produk tidak ditemukan</div>}
          {matches.map((p) => (
            <button type="button" key={p.id} data-testid={`stok-opname-suggestion-${p.id}`} onMouseDown={() => pick(p)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-secondary">
              {p.name} <span className="text-muted-foreground">({p.sku}) · stok {p.stok}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
