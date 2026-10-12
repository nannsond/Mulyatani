import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";

const BADGE = {
  baru: "bg-green-100 text-green-700",
  update: "bg-blue-100 text-blue-700",
  error: "bg-red-100 text-red-700",
};
const LABEL = { baru: "Baru", update: "Diperbarui", error: "Gagal" };

export default function ImportPreviewDialog({ preview, title, busy, onConfirm, onClose }) {
  const count = (s) => preview.filter((p) => p.status === s).length;
  const valid = count("baru") + count("update");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl" data-testid="import-preview-dialog">
        <DialogHeader>
          <DialogTitle>Pratinjau {title}</DialogTitle>
          <DialogDescription data-testid="import-preview-summary">
            {count("baru")} baru, {count("update")} diperbarui, <span className={count("error") ? "text-red-600 font-semibold" : ""}>{count("error")} bermasalah</span>. Baris bermasalah tidak akan disimpan.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[55vh] overflow-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-secondary text-left">
              <tr><th className="px-3 py-2">Baris</th><th className="px-3 py-2">Kode</th><th className="px-3 py-2">Nama</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Keterangan</th></tr>
            </thead>
            <tbody>
              {preview.map((p, i) => (
                <tr key={i} className={`border-t border-slate-100 ${p.status === "error" ? "bg-red-50/60" : ""}`} data-testid={`import-preview-row-${i}`}>
                  <td className="px-3 py-2 font-mono text-xs">{p.row}</td>
                  <td className="px-3 py-2 font-mono text-xs">{p.code || "-"}</td>
                  <td className="px-3 py-2">{p.name || "-"}</td>
                  <td className="px-3 py-2"><span className={`text-xs font-bold px-2 py-0.5 rounded-full ${BADGE[p.status]}`}>{LABEL[p.status]}</span></td>
                  <td className={`px-3 py-2 text-xs ${p.status === "error" ? "text-red-700 font-semibold" : "text-muted-foreground"}`}>{p.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} data-testid="import-preview-cancel" className="px-4 py-2.5 rounded-xl border border-input text-sm hover:bg-secondary">Batal</button>
          <button onClick={onConfirm} disabled={!valid || busy} data-testid="import-preview-confirm"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#1B5E3B] text-white text-sm font-semibold hover:bg-[#143D2B] disabled:opacity-50">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />} Simpan {valid} data valid
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
