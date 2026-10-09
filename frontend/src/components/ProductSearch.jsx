import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { rupiah } from "@/lib/format";

// Pencarian produk ketik manual (typeahead). Hanya produk terdaftar yang cocok (nama/SKU) bisa dipilih.
export default function ProductSearch({ products, exclude = [], onPick, placeholder = "Cari produk...", testid }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    const onDocClick = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const term = q.trim().toLowerCase();
  const matches = term
    ? products.filter((p) => !exclude.includes(p.id) && (
        p.name.toLowerCase().includes(term) || (p.sku || "").toLowerCase().includes(term)
      )).slice(0, 8)
    : [];

  const choose = (p) => { onPick(p.id); setQ(""); setOpen(false); };
  const onKeyDown = (e) => { if (e.key === "Enter") { e.preventDefault(); if (matches.length > 0) choose(matches[0]); } };

  return (
    <div className="relative" ref={boxRef}>
      <div className="relative">
        <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={onKeyDown}
          placeholder={placeholder} data-testid={testid}
          className="w-full pl-9 pr-3 py-2 rounded-lg border border-input text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1B5E3B]" />
      </div>
      {open && term && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-56 overflow-y-auto" data-testid={testid ? `${testid}-results` : undefined}>
          {matches.length === 0 ? (
            <div className="px-3 py-2.5 text-sm text-muted-foreground">Produk tidak ditemukan</div>
          ) : (
            matches.map((p) => (
              <button key={p.id} type="button" onClick={() => choose(p)} data-testid={testid ? `${testid}-option-${p.id}` : undefined}
                className="w-full text-left px-3 py-2.5 text-sm hover:bg-secondary flex items-center justify-between gap-2">
                <span className="truncate">{p.name}</span>
                <span className="text-xs text-muted-foreground font-mono shrink-0">{rupiah(p.harga_jual)}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
