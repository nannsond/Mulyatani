import { useState } from "react";
import { api, apiError } from "@/lib/api";
import { rupiah, fmtDate, todayStr } from "@/lib/format";
import { Check, X, Wallet } from "lucide-react";
import { toast } from "sonner";

export function CairCell({ sale, isAdmin, onSaved }) {
  const diterima = (sale.omzet || 0) - (sale.admin_fee || 0);
  const cair = sale.cair;
  const [editing, setEditing] = useState(false);
  const [tgl, setTgl] = useState("");
  const [nom, setNom] = useState("");

  const open = () => { setTgl(cair?.tanggal || todayStr()); setNom(String(cair?.nominal ?? diterima)); setEditing(true); };
  const save = async () => {
    if (!tgl || nom === "" || Number(nom) < 0) { toast.error("Isi tanggal dan nominal cair"); return; }
    try {
      await api.put(`/ecommerce/sales/${sale.id}/cair`, { tanggal: tgl, nominal: Number(nom) });
      toast.success(`Dana ${sale.ecom_no} ditandai cair`);
      setEditing(false); onSaved();
    } catch (err) { toast.error(apiError(err.response?.data?.detail)); }
  };
  const clear = async () => {
    if (!window.confirm("Batalkan status cair pesanan ini?")) return;
    try { await api.delete(`/ecommerce/sales/${sale.id}/cair`); toast.success("Status cair dibatalkan"); setEditing(false); onSaved(); }
    catch (err) { toast.error(apiError(err.response?.data?.detail)); }
  };

  if (editing) return (
    <div className="flex flex-col items-end gap-1" data-testid={`ecom-cair-form-${sale.id}`}>
      <input type="date" value={tgl} onChange={(e) => setTgl(e.target.value)} data-testid={`ecom-cair-date-${sale.id}`} className="w-32 px-1.5 py-1 rounded-lg border border-input text-xs" />
      <input type="number" min="0" value={nom} onChange={(e) => setNom(e.target.value)} data-testid={`ecom-cair-nominal-${sale.id}`} className="w-32 px-1.5 py-1 rounded-lg border border-input text-xs font-mono text-right" />
      <div className="flex gap-1">
        {cair && <button onClick={clear} data-testid={`ecom-cair-clear-${sale.id}`} className="px-1.5 text-[10px] text-destructive font-semibold">Batal cair</button>}
        <button onClick={() => setEditing(false)} className="p-1 rounded text-muted-foreground hover:bg-secondary"><X className="w-3.5 h-3.5" /></button>
        <button onClick={save} data-testid={`ecom-cair-save-${sale.id}`} className="p-1 rounded bg-[#1B5E3B] text-white"><Check className="w-3.5 h-3.5" /></button>
      </div>
    </div>
  );

  if (!cair) return isAdmin ? (
    <button onClick={open} data-testid={`ecom-cair-open-${sale.id}`} className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg border border-dashed border-slate-300 text-muted-foreground hover:border-[#1B5E3B] hover:text-[#1B5E3B]">
      <Wallet className="w-3 h-3" /> Tandai cair
    </button>
  ) : <span className="text-[11px] text-muted-foreground italic">belum cair</span>;

  const selisih = (cair.nominal || 0) - diterima;
  const body = (
    <>
      <div className="font-mono font-semibold text-[#1B5E3B]">{rupiah(cair.nominal)}</div>
      <div className="text-[10px] text-muted-foreground">{fmtDate(cair.tanggal)}</div>
      <div className={`text-[10px] font-semibold ${selisih === 0 ? "text-muted-foreground" : selisih > 0 ? "text-green-700" : "text-destructive"}`} data-testid={`ecom-cair-selisih-${sale.id}`}>
        {selisih === 0 ? "sesuai" : `selisih ${selisih > 0 ? "+" : "-"}${rupiah(Math.abs(selisih))}`}
      </div>
    </>
  );
  return isAdmin
    ? <button onClick={open} title="Ubah data cair" data-testid={`ecom-cair-${sale.id}`} className="text-right rounded-md px-1 -mx-1 hover:bg-secondary/60">{body}</button>
    : <div className="text-right" data-testid={`ecom-cair-${sale.id}`}>{body}</div>;
}
