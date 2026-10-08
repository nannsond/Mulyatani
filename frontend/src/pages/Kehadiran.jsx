import { useEffect, useState } from "react";
import { api, apiError } from "@/lib/api";
import { fmtDate, fmtJam, fmtDurasi, todayStr } from "@/lib/format";
import { Clock, LogIn, LogOut, Loader2, Save, CheckCircle2, AlarmClock } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";

export default function Kehadiran() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [today, setToday] = useState(null);
  const [loadingToday, setLoadingToday] = useState(true);
  const [acting, setActing] = useState(false);
  const [month, setMonth] = useState(todayStr().slice(0, 7));
  const [data, setData] = useState(null);
  const [startTime, setStartTime] = useState("08:00");
  const [savingStart, setSavingStart] = useState(false);

  const loadToday = () => { setLoadingToday(true); api.get("/attendance/today").then((r) => setToday(r.data.record)).finally(() => setLoadingToday(false)); };
  const loadList = () => { setData(null); api.get(`/attendance?month=${month}`).then((r) => setData(r.data)); };
  const loadStart = () => api.get("/attendance/settings").then((r) => setStartTime(r.data.start_time));
  useEffect(() => { loadToday(); loadStart(); }, []);
  useEffect(() => { loadList(); }, [month]);

  const checkin = async () => {
    setActing(true);
    try { await api.post("/attendance/checkin"); toast.success("Absen masuk tercatat"); loadToday(); loadList(); }
    catch (err) { toast.error(apiError(err.response?.data?.detail)); }
    finally { setActing(false); }
  };
  const checkout = async () => {
    setActing(true);
    try { await api.post("/attendance/checkout"); toast.success("Absen pulang tercatat"); loadToday(); loadList(); }
    catch (err) { toast.error(apiError(err.response?.data?.detail)); }
    finally { setActing(false); }
  };
  const saveStart = async () => {
    setSavingStart(true);
    try { await api.post("/attendance/settings", { start_time: startTime }); toast.success(`Jam masuk disimpan: ${startTime}`); }
    catch (err) { toast.error(apiError(err.response?.data?.detail)); }
    finally { setSavingStart(false); }
  };

  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="bg-card rounded-2xl border border-slate-200 p-6 h-fit" data-testid="attendance-clock-card">
          <h3 className="font-heading font-semibold text-lg flex items-center gap-2 mb-1"><Clock className="w-5 h-5 text-[#1B5E3B]" /> Absensi Hari Ini</h3>
          <p className="text-sm text-muted-foreground mb-5">{fmtDate(todayStr())}</p>
          {loadingToday ? <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 animate-spin text-[#1B5E3B]" /></div> : (
            <>
              {!today && (
                <button onClick={checkin} disabled={acting} data-testid="attendance-checkin-button"
                  className="w-full bg-[#1B5E3B] hover:bg-[#143D2B] text-white py-3 rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
                  {acting ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />} Absen Masuk
                </button>
              )}
              {today && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-xl bg-secondary/50">
                    <span className="text-sm text-muted-foreground flex items-center gap-1.5"><LogIn className="w-4 h-4" /> Masuk</span>
                    <span className="font-mono font-semibold" data-testid="attendance-checkin-time">{fmtJam(today.check_in)}{today.late && <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold">Telat</span>}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-xl bg-secondary/50">
                    <span className="text-sm text-muted-foreground flex items-center gap-1.5"><LogOut className="w-4 h-4" /> Pulang</span>
                    <span className="font-mono font-semibold" data-testid="attendance-checkout-time">{fmtJam(today.check_out)}</span>
                  </div>
                  {today.check_out ? (
                    <div className="flex items-center justify-between p-3 rounded-xl bg-green-50 border border-green-100">
                      <span className="text-sm text-green-800 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> Durasi kerja</span>
                      <span className="font-mono font-bold text-green-800">{fmtDurasi(today.work_minutes)}</span>
                    </div>
                  ) : (
                    <button onClick={checkout} disabled={acting} data-testid="attendance-checkout-button"
                      className="w-full bg-[#C85A32] hover:bg-[#B04B26] text-white py-3 rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
                      {acting ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />} Absen Pulang
                    </button>
                  )}
                </div>
              )}
            </>
          )}
          {isAdmin && (
            <div className="mt-6 pt-5 border-t border-slate-200">
              <label className="text-sm font-medium flex items-center gap-1.5"><AlarmClock className="w-4 h-4 text-[#C85A32]" /> Jam masuk standar (telat jika lewat)</label>
              <div className="mt-1 flex gap-2">
                <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} data-testid="attendance-start-input" className="flex-1 px-3 py-2 rounded-xl border border-input text-sm" />
                <button onClick={saveStart} disabled={savingStart} data-testid="attendance-start-save" className="flex items-center gap-1 px-4 rounded-xl bg-[#1B5E3B] text-white text-sm font-semibold hover:bg-[#143D2B] disabled:opacity-50">
                  {savingStart ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Waktu Indonesia Barat (WIB).</p>
            </div>
          )}
        </div>

        <div className="lg:col-span-2 bg-card rounded-2xl border border-slate-200 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h3 className="font-heading font-semibold text-lg">{isAdmin ? "Rekap Kehadiran Karyawan" : "Kehadiran Saya"}</h3>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} data-testid="attendance-month-filter" className="px-3 py-2 rounded-xl border border-input text-sm" />
          </div>
          {!data ? <div className="flex justify-center py-12"><Loader2 className="w-7 h-7 animate-spin text-[#1B5E3B]" /></div> : (
            <div className="space-y-6">
              {isAdmin && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-slate-200 bg-secondary/50 text-left">
                      <th className="px-3 py-2.5 font-semibold">Karyawan</th><th className="px-3 py-2.5 font-semibold text-right">Hari Hadir</th>
                      <th className="px-3 py-2.5 font-semibold text-right">Telat</th><th className="px-3 py-2.5 font-semibold text-right">Total Jam</th>
                    </tr></thead>
                    <tbody>
                      {data.recap.length === 0 && <tr><td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">Belum ada data kehadiran.</td></tr>}
                      {data.recap.map((r) => (
                        <tr key={r.user_name} className="border-b border-slate-100" data-testid={`attendance-recap-${r.user_name.replace(/\s+/g, "-").toLowerCase()}`}>
                          <td className="px-3 py-2.5 font-medium">{r.user_name}</td>
                          <td className="px-3 py-2.5 text-right">{r.hadir}</td>
                          <td className="px-3 py-2.5 text-right">{r.telat > 0 ? <span className="text-red-700 font-semibold">{r.telat}</span> : 0}</td>
                          <td className="px-3 py-2.5 text-right font-mono">{fmtDurasi(r.total_menit)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="overflow-x-auto">
                <p className="text-sm font-semibold mb-2 text-muted-foreground">Detail Harian</p>
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-slate-200 bg-secondary/50 text-left">
                    <th className="px-3 py-2.5 font-semibold">Tanggal</th>{isAdmin && <th className="px-3 py-2.5 font-semibold">Karyawan</th>}
                    <th className="px-3 py-2.5 font-semibold">Masuk</th><th className="px-3 py-2.5 font-semibold">Pulang</th>
                    <th className="px-3 py-2.5 font-semibold text-right">Durasi</th><th className="px-3 py-2.5 font-semibold text-center">Status</th>
                  </tr></thead>
                  <tbody>
                    {data.records.length === 0 && <tr><td colSpan={isAdmin ? 6 : 5} className="px-3 py-6 text-center text-muted-foreground">Belum ada catatan.</td></tr>}
                    {data.records.map((d) => (
                      <tr key={d.id} className="border-b border-slate-100" data-testid={`attendance-row-${d.id}`}>
                        <td className="px-3 py-2.5 text-xs">{fmtDate(d.date)}</td>
                        {isAdmin && <td className="px-3 py-2.5">{d.user_name}</td>}
                        <td className="px-3 py-2.5 font-mono">{fmtJam(d.check_in)}</td>
                        <td className="px-3 py-2.5 font-mono">{fmtJam(d.check_out)}</td>
                        <td className="px-3 py-2.5 text-right font-mono">{d.check_out ? fmtDurasi(d.work_minutes) : "-"}</td>
                        <td className="px-3 py-2.5 text-center">
                          {d.late ? <span className="text-xs px-2 py-1 rounded-lg bg-red-100 text-red-700 font-semibold">Telat</span> : <span className="text-xs px-2 py-1 rounded-lg bg-green-100 text-green-700 font-semibold">Tepat Waktu</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
