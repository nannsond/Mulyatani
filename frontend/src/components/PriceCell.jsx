import { useRef, useState } from "react";
import { apiError } from "@/lib/api";
import { rupiah } from "@/lib/format";
import { toast } from "sonner";

export default function PriceCell({ value, editable, onSave, testid, className = "", empty, children }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState("");
  const [saving, setSaving] = useState(false);
  const cancelled = useRef(false);

  const start = () => { cancelled.current = false; setVal(value ? String(value) : ""); setEditing(true); };
  const commit = async () => {
    if (cancelled.current) return;
    const n = Number(val) || 0;
    if (n < 0) { toast.error("Harga tidak boleh negatif"); return; }
    if (n === (Number(value) || 0)) { setEditing(false); return; }
    setSaving(true);
    try { await onSave(n); toast.success("Harga diperbarui"); setEditing(false); }
    catch (err) { toast.error(apiError(err.response?.data?.detail)); }
    finally { setSaving(false); }
  };
  const onKey = (e) => {
    if (e.key === "Enter") e.currentTarget.blur();
    if (e.key === "Escape") { cancelled.current = true; setEditing(false); }
  };
  const label = value ? rupiah(value) : (empty ?? rupiah(0));

  return (
    <td className={`px-4 py-3 text-right font-mono ${className}`} data-testid={testid}>
      {editing ? (
        <input autoFocus type="number" min="0" value={val} disabled={saving} onChange={(e) => setVal(e.target.value)} onBlur={commit} onKeyDown={onKey}
          data-testid={`${testid}-input`} className="w-28 px-2 py-1 rounded-lg border border-[#1B5E3B] text-right text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5E3B]" />
      ) : editable ? (
        <button type="button" onClick={start} title="Klik untuk ubah harga" data-testid={`${testid}-edit`}
          className="rounded-md px-1.5 py-0.5 -mx-1.5 border border-transparent hover:border-dashed hover:border-slate-400 hover:bg-secondary/60 cursor-text transition-colors">{label}</button>
      ) : label}
      {!editing && children}
    </td>
  );
}
