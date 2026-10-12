import { useEffect, useState } from "react";
import { api, apiError } from "@/lib/api";
import { fmtDate, todayWIB } from "@/lib/format";
import { ClipboardList, Send, Loader2, Check, X, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";

const STATUS_STYLE = {
  "Pending": "bg-amber-100 text-amber-700",
  "Disetujui": "bg-green-100 text-green-700",
  "Ditolak": "bg-red-100 text-red-700",
};
const TYPE_STYLE = { "Izin": "bg-blue-100 text-blue-700", "Sakit": "bg-amber-100 text-amber-700" };

export default function Pengajuan() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [month, setMonth] = useState(todayWIB().slice(0, 7));
  const [data, setData] = useState(null);
  const [form, setForm] = useState({ date: todayWIB(), type: "Izin", reason: "" });
  const [submitting, setSubmitting] = useState(false);

  const load = () => { setData(null); api.get(`/leave?month=${month}`).then((r) => setData(r.data)); };
  useEffect(() => { load(); }, [month]);

  const submit = async () => {
    if (!form.reason.trim()) { toast.error("Alasan wajib diisi"); return; }
    setSubmitting(true);
    try { await api.post("/leave", form); toast.success("Pengajuan terkirim, menunggu persetujuan admin"); setForm({ date: todayWIB(), type: "Izin", reason: "" }); load(); }
    catch (err) { toast.error(apiError(err.response?.data?.detail)); }
    finally { setSubmitting(false); }
  };
  const review = async (id, approve) => {
    try { await api.put(`/leave/${id}/review`, { approve }); toast.success(approve ? "Pengajuan disetujui" : "Pengajuan ditolak"); load(); }
    catch (err) { toast.error(apiError(err.response?.data?.detail)); }
  };
  const cancel = async (id) => {
    if (!window.confirm("Batalkan pengajuan ini?")) return;
    try { await api.delete(`/leave/${id}`); toast.success("Pengajuan dibatalkan"); load(); }
    catch (err) { toast.error(apiError(err.response?.data?.detail)); }
  };

  const requests = data?.requests || [];
  const pending = requests.filter((r) => r.status === "Pending");

  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="bg-card rounded-2xl border border-slate-200 p-6 h-fit" data-testid="leave-form-card">
          <h3 className="font-heading font-semibold text-lg flex items-center gap-2 mb-4"><ClipboardList className="w-5 h-5 text-[#1B5E3B]" /> Ajukan Izin / Sakit</h3>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Tanggal</label>
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} data-testid="leave-date-input" className="mt-1 w-full px-3 py-2.5 rounded-xl border border-input text-sm" />
            </div>
            <div>
              <label className="text-sm font-medium">Jenis</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} data-testid="leave-type-select" className="mt-1 w-full px-3 py-2.5 rounded-xl border border-input text-sm bg-white">
                <option value="Izin">Izin</option>
                <option value="Sakit">Sakit</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Alasan</label>
              <textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} data-testid="leave-reason-input" rows={3} className="mt-1 w-full px-3 py-2.5 rounded-xl border border-input text-sm resize-none" placeholder="Tulis alasan..." />
            </div>
            <button onClick={submit} disabled={submitting} data-testid="leave-submit-button" className="w-full bg-[#C85A32] hover:bg-[#B04B26] text-white py-2.5 rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Kirim Pengajuan
            </button>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          {isAdmin && pending.length > 0 && (
            <div className="bg-card rounded-2xl border border-amber-200 p-6" data-testid="leave-pending-card">
              <h3 className="font-heading font-semibold text-lg mb-4 flex items-center gap-2">Menunggu Persetujuan <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">{pending.length}</span></h3>
              <div className="space-y-2">
                {pending.map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center gap-3 p-3 rounded-xl border border-slate-200" data-testid={`leave-pending-${r.id}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2"><span className="font-medium">{r.user_name}</span><span className={`text-xs px-2 py-0.5 rounded-lg font-semibold ${TYPE_STYLE[r.type]}`}>{r.type}</span><span className="text-xs text-muted-foreground">{fmtDate(r.date)}</span></div>
                      <p className="text-sm text-muted-foreground truncate">{r.reason}</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => review(r.id, true)} data-testid={`leave-approve-${r.id}`} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#1B5E3B] text-white text-sm font-semibold hover:bg-[#143D2B]"><Check className="w-4 h-4" /> Setujui</button>
                      <button onClick={() => review(r.id, false)} data-testid={`leave-reject-${r.id}`} className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-red-200 text-red-700 text-sm font-semibold hover:bg-red-50"><X className="w-4 h-4" /> Tolak</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-card rounded-2xl border border-slate-200 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h3 className="font-heading font-semibold text-lg">{isAdmin ? "Semua Pengajuan" : "Pengajuan Saya"}</h3>
              <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} data-testid="leave-month-filter" className="px-3 py-2 rounded-xl border border-input text-sm" />
            </div>
            {!data ? <div className="flex justify-center py-12"><Loader2 className="w-7 h-7 animate-spin text-[#1B5E3B]" /></div> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-slate-200 bg-secondary/50 text-left">
                    <th className="px-3 py-2.5 font-semibold">Tanggal</th>{isAdmin && <th className="px-3 py-2.5 font-semibold">Karyawan</th>}
                    <th className="px-3 py-2.5 font-semibold">Jenis</th><th className="px-3 py-2.5 font-semibold">Alasan</th>
                    <th className="px-3 py-2.5 font-semibold text-center">Status</th><th className="px-3 py-2.5 font-semibold text-center">Aksi</th>
                  </tr></thead>
                  <tbody>
                    {requests.length === 0 && <tr><td colSpan={isAdmin ? 6 : 5} className="px-3 py-8 text-center text-muted-foreground">Belum ada pengajuan.</td></tr>}
                    {requests.map((r) => (
                      <tr key={r.id} className="border-b border-slate-100" data-testid={`leave-row-${r.id}`}>
                        <td className="px-3 py-2.5 text-xs">{fmtDate(r.date)}</td>
                        {isAdmin && <td className="px-3 py-2.5">{r.user_name}</td>}
                        <td className="px-3 py-2.5"><span className={`text-xs px-2 py-1 rounded-lg font-semibold ${TYPE_STYLE[r.type]}`}>{r.type}</span></td>
                        <td className="px-3 py-2.5 max-w-[220px] truncate" title={r.reason}>{r.reason}</td>
                        <td className="px-3 py-2.5 text-center"><span className={`text-xs px-2 py-1 rounded-lg font-semibold ${STATUS_STYLE[r.status]}`} data-testid={`leave-status-${r.id}`}>{r.status}</span></td>
                        <td className="px-3 py-2.5 text-center">
                          {isAdmin && r.status === "Pending" && (
                            <div className="flex items-center justify-center gap-1">
                              <button onClick={() => review(r.id, true)} data-testid={`leave-approve-row-${r.id}`} className="p-1.5 rounded-lg bg-[#1B5E3B] text-white hover:bg-[#143D2B]"><Check className="w-3.5 h-3.5" /></button>
                              <button onClick={() => review(r.id, false)} data-testid={`leave-reject-row-${r.id}`} className="p-1.5 rounded-lg border border-red-200 text-red-700 hover:bg-red-50"><X className="w-3.5 h-3.5" /></button>
                            </div>
                          )}
                          {!isAdmin && r.status === "Pending" && (
                            <button onClick={() => cancel(r.id)} data-testid={`leave-cancel-${r.id}`} className="p-1.5 rounded-lg border border-input text-destructive hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" /></button>
                          )}
                          {r.status !== "Pending" && <span className="text-xs text-muted-foreground">{r.reviewed_by || "-"}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
