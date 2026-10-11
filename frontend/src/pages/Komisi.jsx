import { useEffect, useState } from "react";
import { api, apiError } from "@/lib/api";
import { rupiah, todayStr } from "@/lib/format";
import { Percent, Save, Loader2, Coins } from "lucide-react";
import { toast } from "sonner";

export default function Komisi() {
  const [rate, setRate] = useState("");
  const [savedRate, setSavedRate] = useState(0);
  const [saving, setSaving] = useState(false);
  const [month, setMonth] = useState(todayStr().slice(0, 7));
  const [report, setReport] = useState(null);

  const loadSettings = () => api.get("/commission/settings").then((r) => { setSavedRate(r.data.rate); setRate(String(r.data.rate)); });
  const loadReport = () => { setReport(null); api.get(`/commission/report?month=${month}`).then((r) => setReport(r.data)); };
  useEffect(() => { loadSettings(); }, []);
  useEffect(() => { loadReport(); }, [month]);

  const save = async () => {
    setSaving(true);
    try {
      const { data } = await api.post("/commission/settings", { rate: Number(rate) || 0 });
      setSavedRate(data.rate);
      toast.success(`Tarif komisi disimpan: ${data.rate}%`);
      loadReport();
    } catch (err) { toast.error(apiError(err.response?.data?.detail)); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="bg-card rounded-2xl border border-slate-200 p-6 h-fit space-y-4">
          <h3 className="font-heading font-semibold text-lg flex items-center gap-2"><Percent className="w-5 h-5 text-[#1B5E3B]" /> Tarif Komisi</h3>
          <p className="text-sm text-muted-foreground">Komisi dihitung sebagai persentase dari <b>laba kotor</b> penjualan online berstatus <span className="text-green-700 font-semibold">Selesai</span>, untuk karyawan yang menginput pesanan.</p>
          <div>
            <label className="text-sm font-medium">Persentase komisi (%)</label>
            <div className="mt-1 flex gap-2">
              <input type="number" step="0.1" value={rate} onChange={(e) => setRate(e.target.value)} data-testid="commission-rate-input"
                className="flex-1 min-w-0 px-3 py-2.5 rounded-xl border border-input text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5E3B]" placeholder="0" />
              <button onClick={save} disabled={saving} data-testid="commission-save-button" className="shrink-0 flex items-center gap-1 px-4 rounded-xl bg-[#1B5E3B] text-white text-sm font-semibold hover:bg-[#143D2B] disabled:opacity-50">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Simpan
              </button>
            </div>
          </div>
          <div className="p-3 rounded-xl bg-green-50 border border-green-100 text-sm">
            Tarif aktif: <span className="font-mono font-bold text-[#1B5E3B]" data-testid="commission-active-rate">{savedRate}%</span>
          </div>
        </div>

        <div className="lg:col-span-2 bg-card rounded-2xl border border-slate-200 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h3 className="font-heading font-semibold text-lg flex items-center gap-2"><Coins className="w-5 h-5 text-[#C85A32]" /> Rekap Komisi Karyawan</h3>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} data-testid="commission-month-filter" className="px-3 py-2 rounded-xl border border-input text-sm" />
          </div>
          {!report ? <div className="flex justify-center py-12"><Loader2 className="w-7 h-7 animate-spin text-[#1B5E3B]" /></div> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-slate-200 bg-secondary/50 text-left">
                  <th className="px-3 py-2.5 font-semibold">Karyawan</th>
                  <th className="px-3 py-2.5 font-semibold text-right">Pesanan</th>
                  <th className="px-3 py-2.5 font-semibold text-right">Omzet</th>
                  <th className="px-3 py-2.5 font-semibold text-right">Laba Kotor</th>
                  <th className="px-3 py-2.5 font-semibold text-right">Komisi ({report.rate}%)</th>
                </tr></thead>
                <tbody>
                  {report.rows.length === 0 && <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">Belum ada penjualan online Selesai pada bulan ini.</td></tr>}
                  {report.rows.map((r) => (
                    <tr key={r.user_name} className="border-b border-slate-100" data-testid={`commission-row-${r.user_name.replace(/\s+/g, "-").toLowerCase()}`}>
                      <td className="px-3 py-2.5 font-medium">{r.user_name}</td>
                      <td className="px-3 py-2.5 text-right">{r.transaksi}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{rupiah(r.omzet)}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{rupiah(r.laba_kotor)}</td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-[#C85A32]">{rupiah(r.komisi)}</td>
                    </tr>
                  ))}
                  {report.rows.length > 0 && (
                    <tr className="bg-secondary/40 font-semibold">
                      <td className="px-3 py-2.5">TOTAL</td>
                      <td className="px-3 py-2.5 text-right">{report.total.transaksi}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{rupiah(report.total.omzet)}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{rupiah(report.total.laba_kotor)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-[#C85A32]">{rupiah(report.total.komisi)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
