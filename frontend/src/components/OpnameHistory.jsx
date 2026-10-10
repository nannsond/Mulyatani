import { fmtDateTime } from "@/lib/format";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { badge } from "@/components/OpnameSessionForm";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

function DeleteRowButton({ h, onDeleted }) {
  const remove = async () => {
    try {
      await api.delete(`/stok-opname/${h.id}`);
      toast.success("Riwayat opname dihapus");
      onDeleted();
    } catch (err) { toast.error(apiError(err.response?.data?.detail)); }
  };
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <button type="button" data-testid={`opname-delete-${h.id}`} title="Hapus riwayat"
          className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 transition-colors"><Trash2 className="w-4 h-4" /></button>
      </AlertDialogTrigger>
      <AlertDialogContent data-testid="opname-delete-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>Hapus riwayat opname ini?</AlertDialogTitle>
          <AlertDialogDescription>
            Catatan {h.product_name} dari {fmtDateTime(h.created_at)} akan dihapus. Stok produk saat ini tidak berubah.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="opname-delete-cancel">Batal</AlertDialogCancel>
          <AlertDialogAction onClick={remove} data-testid="opname-delete-confirm" className="bg-red-600 hover:bg-red-700">Hapus</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function OpnameHistory({ history, isAdmin, onDeleted }) {
  const colSpan = isAdmin ? 7 : 6;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-secondary/50 text-left">
            <th className="px-3 py-2.5 font-semibold">Tanggal</th>
            <th className="px-3 py-2.5 font-semibold">Produk</th>
            <th className="px-3 py-2.5 font-semibold text-center">Sistem</th>
            <th className="px-3 py-2.5 font-semibold text-center">Fisik</th>
            <th className="px-3 py-2.5 font-semibold text-center">Status</th>
            <th className="px-3 py-2.5 font-semibold">Alasan</th>
            {isAdmin && <th className="px-3 py-2.5" />}
          </tr>
        </thead>
        <tbody>
          {history.length === 0 && <tr><td colSpan={colSpan} className="px-3 py-8 text-center text-muted-foreground">Belum ada riwayat.</td></tr>}
          {history.map((h) => (
            <tr key={h.id} className="border-b border-slate-100" data-testid={`opname-row-${h.id}`}>
              <td className="px-3 py-2.5 text-xs text-muted-foreground">{fmtDateTime(h.created_at)}</td>
              <td className="px-3 py-2.5 font-medium">{h.product_name}</td>
              <td className="px-3 py-2.5 text-center font-mono">{h.stok_sistem}</td>
              <td className="px-3 py-2.5 text-center font-mono">{h.stok_fisik}</td>
              <td className="px-3 py-2.5 text-center"><span className={`text-xs font-semibold px-2 py-1 rounded-lg ${badge(h.selisih).c}`}>{badge(h.selisih).t}</span></td>
              <td className="px-3 py-2.5 text-xs">{h.alasan}</td>
              {isAdmin && <td className="px-3 py-2.5 text-right"><DeleteRowButton h={h} onDeleted={onDeleted} /></td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
