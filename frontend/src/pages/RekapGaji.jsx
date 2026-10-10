import { useEffect, useState } from "react";
import { api, apiError } from "@/lib/api";
import { rupiah, MONTHS, todayStr } from "@/lib/format";
import { printPayslip } from "@/lib/exporter";
import { useSettings } from "@/context/SettingsContext";
import { Wallet, Save, Loader2, Printer, RotateCcw, AlarmClock, Archive, FolderOpen, ListPlus } from "lucide-react";
import { PayrollDetailDialog } from "@/components/PayrollDetailDialog";
import { toast } from "sonner";

export default function RekapGaji() {
  const { settings } = useSettings();
  const logoUrl = settings?.has_logo ? `${process.env.REACT_APP_BACKEND_URL}/api/settings/logo?v=${encodeURIComponent(settings.logo_updated || "")}` : undefined;
  const storeInfo = { store_name: settings?.store_name, address: settings?.address, phone: settings?.phone };
  const [month, setMonth] = useState(todayStr().slice(0, 7));
  const [report, setReport] = useState(null);
  const [edits, setEdits] = useState({});
  const [potongan, setPotongan] = useState("");
  const [hariKerja, setHariKerja] = useState("26");
  const [savingPot, setSavingPot] = useState(false);
  const [savingRow, setSavingRow] = useState(null);
  const [archives, setArchives] = useState([]);
  const [archiving, setArchiving] = useState(false);
  const [kota, setKota] = useState("");
  const [ttd, setTtd] = useState("");
  const [detailRow, setDetailRow] = useState(null);

  const loadArchives = () => api.get("/payroll/archives").then((r) => setArchives(r.data));

  const load = () => {
    setReport(null);
    api.get(`/payroll/report?month=${month}`).then((r) => {
      setReport(r.data);
      setPotongan(String(r.data.potongan_telat || 0));
      setHariKerja(String(r.data.hari_kerja || 26));
      setKota(r.data.kota || ""); setTtd(r.data.penandatangan || "");
      const e = {};
      r.data.rows.forEach((row) => { e[row.user_id] = { gaji_pokok: row.gaji_pokok, komisi: row.komisi, potongan: row.potongan, bonus_items: row.bonus_items || [], potongan_lain: row.potongan_lain || 0, potongan_lain_ket: row.potongan_lain_ket || "" }; });
      setEdits(e);
    });
  };
  useEffect(() => { load(); }, [month]);
  useEffect(() => { loadArchives(); }, []);

  const archive = async () => {
    setArchiving(true);
    try { const { data } = await api.post("/payroll/archive", { month }); toast.success(`Slip gaji ${monthLabel} diarsipkan (${data.archived} karyawan)`); loadArchives(); load(); }
    catch (err) { toast.error(apiError(err.response?.data?.detail)); }
    finally { setArchiving(false); }
  };

  const monthLabel = `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
  const setField = (uid, field, v) => setEdits((e) => ({ ...e, [uid]: { ...e[uid], [field]: Number(v) || 0 } }));
  const bonusSum = (e) => (e.bonus_items || []).reduce((s, b) => s + (Number(b.jumlah) || 0), 0);
  const rowTotal = (uid) => { const e = edits[uid] || {}; return (e.gaji_pokok || 0) + (e.komisi || 0) + bonusSum(e) - (e.potongan || 0) - (e.potongan_lain || 0); };
  const applyDetail = (uid, v) => setEdits((e) => ({ ...e, [uid]: { ...e[uid], ...v } }));

  const savePotongan = async () => {
    setSavingPot(true);
    try { await api.post("/payroll/settings", { potongan_telat: Number(potongan) || 0, hari_kerja: Number(hariKerja) || 26, kota, penandatangan: ttd }); toast.success("Pengaturan potongan disimpan"); load(); }
    catch (err) { toast.error(apiError(err.response?.data?.detail)); }
    finally { setSavingPot(false); }
  };

  const saveRow = async (row) => {
    const e = edits[row.user_id];
    setSavingRow(row.user_id);
    try {
      await api.post("/payroll/save", { user_id: row.user_id, month, gaji_pokok: e.gaji_pokok || 0, komisi: e.komisi || 0, potongan: e.potongan || 0, bonus_items: e.bonus_items || [], potongan_lain: e.potongan_lain || 0, potongan_lain_ket: e.potongan_lain_ket || "" });
      toast.success(`Gaji ${row.user_name} disimpan`);
      load();
    } catch (err) { toast.error(apiError(err.response?.data?.detail)); }
    finally { setSavingRow(null); }
  };

  const resetRow = async (row) => {
    try { await api.delete(`/payroll/override?user_id=${row.user_id}&month=${month}`); toast.success("Direset ke perhitungan otomatis"); load(); }
    catch (err) { toast.error(apiError(err.response?.data?.detail)); }
  };

  const printRow = (row) => {
    const e = edits[row.user_id] || {};
    printPayslip({ row: { ...row, ...e, gaji_pokok: e.gaji_pokok || 0, komisi: e.komisi || 0, potongan: e.potongan || 0, total: rowTotal(row.user_id) }, monthLabel, info: storeInfo, logoUrl,
      payroll: { hari_kerja: report.hari_kerja, potongan_telat: report.potongan_telat, kota: report.kota, penandatangan: report.penandatangan } });
  };

  const grand = report ? report.rows.reduce((s, r) => s + rowTotal(r.user_id), 0) : 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 bg-card rounded-xl border border-slate-200 px-3 py-2">
          <AlarmClock className="w-4 h-4 text-[#C85A32]" />
          <span className="text-sm text-muted-foreground">Potongan/telat (Rp)</span>
          <input type="number" value={potongan} onChange={(e) => setPotongan(e.target.value)} data-testid="payroll-potongan-input" className="w-24 px-2 py-1 rounded-lg border border-input text-sm" placeholder="0" />
          <span className="text-sm text-muted-foreground">Hari kerja/bln</span>
          <input type="number" value={hariKerja} onChange={(e) => setHariKerja(e.target.value)} data-testid="payroll-harikerja-input" className="w-16 px-2 py-1 rounded-lg border border-input text-sm" placeholder="26" />
          <span className="text-sm text-muted-foreground">Kota</span>
          <input value={kota} onChange={(e) => setKota(e.target.value)} data-testid="payroll-kota-input" className="w-28 px-2 py-1 rounded-lg border border-input text-sm" placeholder="Madiun" />
          <span className="text-sm text-muted-foreground">Penandatangan</span>
          <input value={ttd} onChange={(e) => setTtd(e.target.value)} data-testid="payroll-ttd-input" className="w-32 px-2 py-1 rounded-lg border border-input text-sm" placeholder="Nama owner" />
          <button onClick={savePotongan} disabled={savingPot} data-testid="payroll-potongan-save" className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#1B5E3B] text-white text-sm font-semibold hover:bg-[#143D2B] disabled:opacity-50">
            {savingPot ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          </button>
        </div>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} data-testid="payroll-month-filter" className="px-3 py-2 rounded-xl border border-input text-sm bg-card" />
        <button onClick={archive} disabled={archiving} data-testid="payroll-archive-button" className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#C85A32] hover:bg-[#B04B26] text-white text-sm font-semibold disabled:opacity-50">
          {archiving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4" />} Arsipkan Bulan Ini
        </button>
      </div>

      <div className="bg-card rounded-2xl border border-slate-200 p-6" data-testid="payroll-table">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-11 h-11 rounded-xl bg-[#1B5E3B] flex items-center justify-center"><Wallet className="w-6 h-6 text-white" /></div>
          <div>
            <h2 className="font-heading font-bold text-xl text-[#0F281E]">Rekap Gaji Karyawan</h2>
            <p className="text-sm text-muted-foreground">{monthLabel} • Komisi {report?.commission_rate ?? 0}% dari laba kotor online "Selesai"</p>
          </div>
        </div>
        {!report ? <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-[#1B5E3B]" /></div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead><tr className="border-b border-slate-200 bg-secondary/50 text-left">
                <th className="px-3 py-2.5 font-semibold">Karyawan</th>
                <th className="px-3 py-2.5 font-semibold text-center">Hadir</th>
                <th className="px-3 py-2.5 font-semibold text-center">Telat</th>
                <th className="px-3 py-2.5 font-semibold text-center">Alpha</th>
                <th className="px-3 py-2.5 font-semibold text-right">Gaji Pokok</th>
                <th className="px-3 py-2.5 font-semibold text-right">Komisi</th>
                <th className="px-3 py-2.5 font-semibold text-right">Potongan</th>
                <th className="px-3 py-2.5 font-semibold text-right">Bonus / Pot. Lain</th>
                <th className="px-3 py-2.5 font-semibold text-right">Total</th>
                <th className="px-3 py-2.5 font-semibold text-center">Aksi</th>
              </tr></thead>
              <tbody>
                {report.rows.map((row) => {
                  const e = edits[row.user_id] || {};
                  return (
                    <tr key={row.user_id} className="border-b border-slate-100" data-testid={`payroll-row-${row.user_id}`}>
                      <td className="px-3 py-2.5">
                        <div className="font-medium">{row.user_name}</div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{row.role}</span>
                          {row.edited && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-semibold">diedit</span>}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-center">{row.hadir}</td>
                      <td className="px-3 py-2.5 text-center">{row.telat > 0 ? <span className="text-red-700 font-semibold">{row.telat}</span> : 0}</td>
                      <td className="px-3 py-2.5 text-center">{row.alpha > 0 ? <span className="text-red-700 font-semibold">{row.alpha}</span> : 0}</td>
                      <td className="px-3 py-2.5 text-right"><input type="number" value={e.gaji_pokok ?? ""} onChange={(ev) => setField(row.user_id, "gaji_pokok", ev.target.value)} data-testid={`payroll-gaji-${row.user_id}`} className="w-28 px-2 py-1 rounded-lg border border-input text-xs font-mono text-right" /></td>
                      <td className="px-3 py-2.5 text-right"><input type="number" value={e.komisi ?? ""} onChange={(ev) => setField(row.user_id, "komisi", ev.target.value)} data-testid={`payroll-komisi-${row.user_id}`} className="w-28 px-2 py-1 rounded-lg border border-input text-xs font-mono text-right" /></td>
                      <td className="px-3 py-2.5 text-right"><input type="number" value={e.potongan ?? ""} onChange={(ev) => setField(row.user_id, "potongan", ev.target.value)} data-testid={`payroll-potongan-row-${row.user_id}`} className="w-28 px-2 py-1 rounded-lg border border-input text-xs font-mono text-right" /></td>
                      <td className="px-3 py-2.5 text-right">
                        <button onClick={() => setDetailRow(row)} data-testid={`payroll-detail-${row.user_id}`} className="inline-flex flex-col items-end px-2 py-1 rounded-lg border border-input hover:bg-secondary text-xs font-mono">
                          <span className="flex items-center gap-1 text-[#1B5E3B]"><ListPlus className="w-3 h-3" />+{rupiah(bonusSum(e))}</span>
                          <span className="text-red-700">-{rupiah(e.potongan_lain || 0)}</span>
                        </button>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-[#1B5E3B]" data-testid={`payroll-total-${row.user_id}`}>{rupiah(rowTotal(row.user_id))}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => saveRow(row)} disabled={savingRow === row.user_id} data-testid={`payroll-save-${row.user_id}`} title="Simpan" className="p-1.5 rounded-lg bg-[#1B5E3B] text-white hover:bg-[#143D2B] disabled:opacity-50">{savingRow === row.user_id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}</button>
                          <button onClick={() => printRow(row)} data-testid={`payroll-print-${row.user_id}`} title="Cetak slip PDF" className="p-1.5 rounded-lg border border-input hover:bg-secondary"><Printer className="w-3.5 h-3.5" /></button>
                          {row.edited && <button onClick={() => resetRow(row)} data-testid={`payroll-reset-${row.user_id}`} title="Reset ke otomatis" className="p-1.5 rounded-lg border border-input hover:bg-secondary text-muted-foreground"><RotateCcw className="w-3.5 h-3.5" /></button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                <tr className="bg-secondary/40 font-semibold">
                  <td className="px-3 py-2.5" colSpan={8}>TOTAL GAJI SEMUA KARYAWAN</td>
                  <td className="px-3 py-2.5 text-right font-mono text-[#1B5E3B]" data-testid="payroll-grand-total">{rupiah(grand)}</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
            <p className="text-xs text-muted-foreground mt-3">Total = Gaji Pokok + Komisi + Bonus − Potongan − Potongan Lain. Potongan = (telat × tarif) + (Alpha × gaji harian), gaji harian = gaji pokok ÷ hari kerja. Nilai bisa diedit; simpan untuk menyimpan slip bulan ini (gaji pokok dipakai ulang bulan berikutnya).</p>
          </div>
        )}
      </div>

      <PayrollDetailDialog open={!!detailRow} onOpenChange={(o) => !o && setDetailRow(null)} row={detailRow}
        value={detailRow ? edits[detailRow.user_id] : null} onApply={(v) => applyDetail(detailRow.user_id, v)} />

      <div className="bg-card rounded-2xl border border-slate-200 p-6" data-testid="payroll-archives">
        <h3 className="font-heading font-semibold text-lg mb-4 flex items-center gap-2"><FolderOpen className="w-5 h-5 text-[#1B5E3B]" /> Arsip Slip Gaji</h3>
        {archives.length === 0 ? <p className="text-sm text-muted-foreground">Belum ada arsip. Klik "Arsipkan Bulan Ini" untuk menyimpan slip gaji bulan berjalan.</p> : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {archives.map((a) => (
              <button key={a.month} onClick={() => setMonth(a.month)} data-testid={`payroll-archive-${a.month}`}
                className={`text-left p-4 rounded-xl border transition-all hover:shadow-md ${a.month === month ? "border-[#1B5E3B] bg-green-50" : "border-slate-200 hover:border-[#1B5E3B]"}`}>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[#0F281E]">{MONTHS[Number(a.month.slice(5, 7)) - 1]} {a.month.slice(0, 4)}</span>
                  <Archive className="w-4 h-4 text-muted-foreground" />
                </div>
                <p className="text-xs text-muted-foreground mt-1">{a.count} karyawan</p>
                <p className="font-mono font-bold text-[#1B5E3B] mt-1">{rupiah(a.total)}</p>
              </button>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground mt-3">Klik bulan untuk membuka kembali rekapnya, lalu cetak ulang slip tiap karyawan.</p>
      </div>
    </div>
  );
}
