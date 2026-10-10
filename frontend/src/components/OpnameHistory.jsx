import { useState } from "react";
import { fmtDateTime } from "@/lib/format";
import { ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { badge } from "@/components/OpnameSessionForm";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

export function groupSessions(history) {
  const map = new Map();
  for (const h of history) {
    const key = h.session_id || h.id;
    if (!map.has(key)) map.set(key, { key, created_at: h.created_at, user_name: h.user_name, items: [] });
    map.get(key).items.push(h);
  }
  return [...map.values()].map((s) => ({
    ...s,
    kurang: s.items.reduce((a, i) => a + (i.selisih < 0 ? -i.selisih : 0), 0),
    lebih: s.items.reduce((a, i) => a + (i.selisih > 0 ? i.selisih : 0), 0),
    nKurang: s.items.filter((i) => i.selisih < 0).length,
    nLebih: s.items.filter((i) => i.selisih > 0).length,
    nSesuai: s.items.filter((i) => i.selisih === 0).length,
  }));
}

const Stat = ({ label, value, sub, cls, testid }) => (
  <div className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${cls}`} data-testid={testid}>
    {label} {value}{sub !== undefined && <span className="font-normal opacity-80"> ({sub} produk)</span>}
  </div>
);

function SessionItems({ items }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-muted-foreground border-b border-slate-100">
          <th className="px-3 py-2 font-medium">Produk</th>
          <th className="px-3 py-2 font-medium text-center">Sistem</th>
          <th className="px-3 py-2 font-medium text-center">Fisik</th>
          <th className="px-3 py-2 font-medium text-center">Status</th>
          <th className="px-3 py-2 font-medium">Alasan</th>
        </tr>
      </thead>
      <tbody>
        {items.map((h) => (
          <tr key={h.id} className="border-b border-slate-100 last:border-0" data-testid={`opname-row-${h.id}`}>
            <td className="px-3 py-2 font-medium">{h.product_name}</td>
            <td className="px-3 py-2 text-center font-mono">{h.stok_sistem}</td>
            <td className="px-3 py-2 text-center font-mono">{h.stok_fisik}</td>
            <td className="px-3 py-2 text-center"><span className={`text-xs font-semibold px-2 py-1 rounded-lg ${badge(h.selisih).c}`}>{badge(h.selisih).t}</span></td>
            <td className="px-3 py-2 text-xs">{h.alasan}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DeleteSessionButton({ s, onDeleted }) {
  const remove = async () => {
    try {
      const { data } = await api.delete(`/stok-opname/session/${s.key}`);
      toast.success(`Riwayat sesi dihapus (${data.deleted} produk)`);
      onDeleted();
    } catch (err) { toast.error(apiError(err.response?.data?.detail)); }
  };
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <button type="button" data-testid={`opname-session-delete-${s.key}`} title="Hapus riwayat sesi"
          className="p-2 mr-2 rounded-lg text-red-500 hover:bg-red-50 transition-colors"><Trash2 className="w-4 h-4" /></button>
      </AlertDialogTrigger>
      <AlertDialogContent data-testid="opname-session-delete-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>Hapus riwayat sesi ini?</AlertDialogTitle>
          <AlertDialogDescription>
            {s.items.length} catatan opname dari {fmtDateTime(s.created_at)} akan dihapus dari riwayat. Stok produk saat ini tidak berubah.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="opname-session-delete-cancel">Batal</AlertDialogCancel>
          <AlertDialogAction onClick={remove} data-testid="opname-session-delete-confirm" className="bg-red-600 hover:bg-red-700">Hapus</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function SessionCard({ s, defaultOpen, isAdmin, onDeleted }) {
  const [open, setOpen] = useState(defaultOpen);
  const note = s.items.find((i) => i.note)?.note;
  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden" data-testid={`opname-session-${s.key}`}>
      <div className="flex items-center bg-secondary/40">
      <button type="button" onClick={() => setOpen(!open)} data-testid={`opname-session-toggle-${s.key}`}
        className="flex-1 flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-secondary/70 text-left transition-colors">
        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        <div className="min-w-0 mr-auto">
          <div className="text-sm font-semibold text-[#0F281E]">{fmtDateTime(s.created_at)}</div>
          <div className="text-xs text-muted-foreground">{s.user_name} · {s.items.length} produk{note ? ` · ${note}` : ""}</div>
        </div>
        <Stat label="Kurang" value={s.kurang} sub={s.nKurang} cls="bg-red-100 text-red-700" testid={`opname-session-kurang-${s.key}`} />
        <Stat label="Lebih" value={`+${s.lebih}`} sub={s.nLebih} cls="bg-blue-100 text-blue-700" testid={`opname-session-lebih-${s.key}`} />
        <Stat label="Sesuai" value={s.nSesuai} cls="bg-green-100 text-green-700" testid={`opname-session-sesuai-${s.key}`} />
      </button>
      {isAdmin && <DeleteSessionButton s={s} onDeleted={onDeleted} />}
      </div>
      {open && <div className="overflow-x-auto"><SessionItems items={s.items} /></div>}
    </div>
  );
}

export function OpnameHistory({ history, isAdmin, onDeleted }) {
  const sessions = groupSessions(history);
  if (sessions.length === 0) return <div className="py-8 text-center text-sm text-muted-foreground">Belum ada riwayat.</div>;
  return (
    <div className="space-y-3" data-testid="opname-history-sessions">
      {sessions.map((s, i) => <SessionCard key={s.key} s={s} defaultOpen={i === 0} isAdmin={isAdmin} onDeleted={onDeleted} />)}
    </div>
  );
}
