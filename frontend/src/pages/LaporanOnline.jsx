import { useEffect, useState } from "react";
import { api, apiError } from "@/lib/api";
import { rupiah, MONTHS, todayStr, CHANNEL_COLORS } from "@/lib/format";
import { exportPDF, exportExcel } from "@/lib/exporter";
import { Loader2, FileDown, FileSpreadsheet, Globe, Wallet, TrendingUp, Receipt, Target, Save } from "lucide-react";
import { BarChart, Bar, AreaChart, Area, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid, Cell } from "recharts";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";

const now = new Date();
const STATUSES = ["Diproses", "Dikirim", "Selesai", "Dikembalikan"];

export default function LaporanOnline() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [mode, setMode] = useState("bulanan");
  const [date, setDate] = useState(todayStr());
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [status, setStatus] = useState("");
  const [data, setData] = useState(null);
  const [targetEdits, setTargetEdits] = useState({});

  const load = () => {
    let url = `/ecommerce/reports?mode=${mode}`;
    if (mode === "harian") url += `&date=${date}`;
    else if (mode === "tahunan") url += `&year=${year}`;
    else url += `&year=${year}&month=${month}`;
    if (status) url += `&status=${encodeURIComponent(status)}`;
    api.get(url).then((r) => {
      setData(r.data);
      const te = {};
      (r.data.channels || []).forEach((c) => { te[c.channel] = c.target || ""; });
      setTargetEdits(te);
    });
  };
  useEffect(() => { setData(null); load(); }, [mode, date, year, month, status]);

  const colorOf = (n) => data?.channel_colors?.[n] || CHANNEL_COLORS[n] || "#64748b";
  const periodeLabel = mode === "harian" ? date : mode === "tahunan" ? `Tahun ${year}` : `${MONTHS[month - 1]} ${year}`;
  const s = data?.summary;
  const channels = data?.channels || [];
  const names = data?.channel_names || [];
  const barData = channels.filter((c) => c.omzet > 0 || c.transaksi > 0);
  const trend = (data?.series || []).map((row) => ({
    ...row,
    label: mode === "tahunan" ? MONTHS[parseInt(row.label, 10) - 1].slice(0, 3) : row.label,
  }));

  const saveTarget = async (channel) => {
    try {
      await api.post("/ecommerce/targets", { channel, year, month, target_omzet: Number(targetEdits[channel]) || 0 });
      toast.success(`Target ${channel} disimpan`);
      load();
    } catch (err) { toast.error(apiError(err.response?.data?.detail)); }
  };

  const cards = [
    { label: "Total Omzet", value: s?.omzet, icon: Globe, color: "#1B5E3B" },
    { label: "Total Biaya Marketplace", value: s?.fee, icon: Wallet, color: "#C85A32" },
    { label: "Laba Kotor", value: s?.laba_kotor, icon: Receipt, color: "#2E4CE5" },
    { label: "Laba Bersih", value: s?.laba_bersih, icon: TrendingUp, color: "#0E7A4B" },
  ];

  const exportCols = ["Channel", "Omzet", "Biaya", "Laba Kotor", "Laba Bersih", "Transaksi", "Item"];
  const exportRows = channels.map((c) => [c.channel, c.omzet, c.fee, c.laba_kotor, c.laba_bersih, c.transaksi, c.item]);
  const exportFoot = s ? ["TOTAL", s.omzet, s.fee, s.laba_kotor, s.laba_bersih, s.transaksi, s.item] : undefined;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <div className="flex rounded-xl border border-input overflow-hidden">
            {["harian", "bulanan", "tahunan"].map((m) => (
              <button key={m} onClick={() => setMode(m)} data-testid={`ecom-rep-mode-${m}`}
                className={`px-4 py-2 text-sm font-semibold capitalize ${mode === m ? "bg-[#1B5E3B] text-white" : "bg-card hover:bg-secondary"}`}>{m}</button>
            ))}
          </div>
          {mode === "harian" && <input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="ecom-rep-date" className="px-3 py-2 rounded-xl border border-input text-sm bg-card" />}
          {mode === "bulanan" && (
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))} data-testid="ecom-rep-month" className="px-3 py-2 rounded-xl border border-input text-sm bg-card">
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          )}
          {mode !== "harian" && (
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} data-testid="ecom-rep-year" className="px-3 py-2 rounded-xl border border-input text-sm bg-card">
              {[0, 1, 2].map((d) => <option key={d} value={now.getFullYear() - d}>{now.getFullYear() - d}</option>)}
            </select>
          )}
          <select value={status} onChange={(e) => setStatus(e.target.value)} data-testid="ecom-rep-status" className="px-3 py-2 rounded-xl border border-input text-sm bg-card">
            <option value="">Semua status</option>
            {STATUSES.map((st) => <option key={st} value={st}>{st}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          <button onClick={() => exportPDF({ title: "Laporan Penjualan Online", subtitle: periodeLabel, columns: exportCols, rows: exportRows, foot: exportFoot })} data-testid="export-pdf-button" className="flex items-center gap-2 px-3 py-2 rounded-xl border border-input text-sm hover:bg-secondary"><FileDown className="w-4 h-4" /> PDF</button>
          <button onClick={() => exportExcel({ filename: `Penjualan_Online_${periodeLabel.replace(/\s+/g, "_")}`, sheetName: "Online", columns: exportCols, rows: [...exportRows, ...(exportFoot ? [exportFoot] : [])] })} data-testid="export-excel-button" className="flex items-center gap-2 px-3 py-2 rounded-xl border border-input text-sm hover:bg-secondary"><FileSpreadsheet className="w-4 h-4" /> Excel</button>
        </div>
      </div>

      {!data ? <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-[#1B5E3B]" /></div> : (
        <>
          {data.status_counts && Object.keys(data.status_counts).length > 0 && (
            <div className="flex flex-wrap gap-2" data-testid="ecom-rep-status-counts">
              {STATUSES.filter((st) => data.status_counts[st]).map((st) => (
                <span key={st} className="text-xs px-3 py-1.5 rounded-full bg-secondary font-medium">{st}: <b>{data.status_counts[st]}</b></span>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" data-testid="ecom-rep-summary">
            {cards.map((c) => (
              <div key={c.label} className="bg-card rounded-2xl border border-slate-200 p-5">
                <div className="flex items-center gap-2 mb-2"><div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: c.color + "1a" }}><c.icon className="w-4 h-4" style={{ color: c.color }} /></div></div>
                <p className="text-xs text-muted-foreground">{c.label}</p>
                <p className="font-mono font-bold text-lg mt-1" style={{ color: c.color }}>{rupiah(c.value)}</p>
              </div>
            ))}
          </div>

          <div className="grid lg:grid-cols-2 gap-5">
            <div className="bg-card rounded-2xl border border-slate-200 p-6">
              <h3 className="font-heading font-semibold text-lg mb-4">Perbandingan Omzet per Channel</h3>
              {barData.length === 0 ? <p className="text-sm text-muted-foreground py-10 text-center">Belum ada data penjualan pada periode ini.</p> : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={channels}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef2f0" />
                    <XAxis dataKey="channel" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${Math.round(v / 1000)}rb`} />
                    <Tooltip formatter={(v) => rupiah(v)} />
                    <Bar dataKey="omzet" name="Omzet" radius={[6, 6, 0, 0]}>
                      {channels.map((c) => <Cell key={c.channel} fill={colorOf(c.channel)} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="bg-card rounded-2xl border border-slate-200 p-6">
              <h3 className="font-heading font-semibold text-lg mb-4">{mode === "harian" ? "Laba Bersih per Channel" : `Tren Omzet (${mode === "tahunan" ? "per Bulan" : "per Hari"})`}</h3>
              {mode === "harian" ? (
                barData.length === 0 ? <p className="text-sm text-muted-foreground py-10 text-center">Belum ada data.</p> : (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={channels}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eef2f0" />
                      <XAxis dataKey="channel" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${Math.round(v / 1000)}rb`} />
                      <Tooltip formatter={(v) => rupiah(v)} />
                      <Bar dataKey="laba_bersih" name="Laba Bersih" radius={[6, 6, 0, 0]}>
                        {channels.map((c) => <Cell key={c.channel} fill={colorOf(c.channel)} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )
              ) : trend.length === 0 ? <p className="text-sm text-muted-foreground py-10 text-center">Belum ada data.</p> : (
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={trend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef2f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${Math.round(v / 1000)}rb`} />
                    <Tooltip formatter={(v) => rupiah(v)} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {names.map((c) => (
                      <Area key={c} type="monotone" dataKey={c} stackId="1" stroke={colorOf(c)} fill={colorOf(c)} fillOpacity={0.5} />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {mode === "bulanan" && (
            <div className="bg-card rounded-2xl border border-slate-200 p-6" data-testid="ecom-rep-targets">
              <h3 className="font-heading font-semibold text-lg mb-4 flex items-center gap-2"><Target className="w-5 h-5 text-[#1B5E3B]" /> Target Omzet per Channel — {MONTHS[month - 1]} {year}</h3>
              <div className="space-y-4">
                {channels.map((c) => {
                  const tgt = c.target || 0;
                  const pct = tgt > 0 ? Math.min(100, (c.omzet / tgt) * 100) : 0;
                  return (
                    <div key={c.channel} data-testid={`ecom-target-${c.channel.replace(/\s+/g, "-").toLowerCase()}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                        <span className="text-sm font-medium flex items-center gap-2"><span className="w-3 h-3 rounded-sm" style={{ backgroundColor: colorOf(c.channel) }} />{c.channel}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground font-mono">{rupiah(c.omzet)}{tgt > 0 ? ` / ${rupiah(tgt)}` : ""}</span>
                          {tgt > 0 && <span className={`text-xs font-semibold ${pct >= 100 ? "text-green-700" : "text-[#C85A32]"}`}>{pct.toFixed(0)}%</span>}
                          {isAdmin && (
                            <div className="flex items-center gap-1">
                              <input type="number" value={targetEdits[c.channel] ?? ""} onChange={(e) => setTargetEdits({ ...targetEdits, [c.channel]: e.target.value })} data-testid={`ecom-target-input-${c.channel.replace(/\s+/g, "-").toLowerCase()}`}
                                placeholder="Set target" className="w-28 px-2 py-1 rounded-lg border border-input text-xs" />
                              <button onClick={() => saveTarget(c.channel)} data-testid={`ecom-target-save-${c.channel.replace(/\s+/g, "-").toLowerCase()}`} className="p-1.5 rounded-lg bg-[#1B5E3B] text-white hover:bg-[#143D2B]"><Save className="w-3.5 h-3.5" /></button>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="h-2.5 rounded-full bg-secondary overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: colorOf(c.channel) }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="bg-card rounded-2xl border border-slate-200 p-6" data-testid="ecom-rep-table">
            <h3 className="font-heading font-semibold text-lg mb-4">Rincian per Channel — {periodeLabel}</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-slate-200 bg-secondary/50 text-left">
                  <th className="px-3 py-2.5 font-semibold">Channel</th><th className="px-3 py-2.5 font-semibold text-right">Omzet</th>
                  <th className="px-3 py-2.5 font-semibold text-right">Biaya</th><th className="px-3 py-2.5 font-semibold text-right">Laba Kotor</th>
                  <th className="px-3 py-2.5 font-semibold text-right">Laba Bersih</th><th className="px-3 py-2.5 font-semibold text-right">Transaksi</th><th className="px-3 py-2.5 font-semibold text-right">Item</th>
                </tr></thead>
                <tbody>
                  {channels.map((c) => (
                    <tr key={c.channel} className="border-b border-slate-100" data-testid={`ecom-rep-channel-${c.channel.replace(/\s+/g, "-").toLowerCase()}`}>
                      <td className="px-3 py-2.5"><span className="text-xs px-2 py-1 rounded-lg text-white font-semibold" style={{ backgroundColor: colorOf(c.channel) }}>{c.channel}</span></td>
                      <td className="px-3 py-2.5 text-right font-mono">{rupiah(c.omzet)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-destructive">{rupiah(c.fee)}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{rupiah(c.laba_kotor)}</td>
                      <td className="px-3 py-2.5 text-right font-mono font-semibold text-[#1B5E3B]">{rupiah(c.laba_bersih)}</td>
                      <td className="px-3 py-2.5 text-right">{c.transaksi}</td>
                      <td className="px-3 py-2.5 text-right">{c.item}</td>
                    </tr>
                  ))}
                  {s && (
                    <tr className="bg-secondary/40 font-semibold">
                      <td className="px-3 py-2.5">TOTAL</td>
                      <td className="px-3 py-2.5 text-right font-mono">{rupiah(s.omzet)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-destructive">{rupiah(s.fee)}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{rupiah(s.laba_kotor)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-[#1B5E3B]">{rupiah(s.laba_bersih)}</td>
                      <td className="px-3 py-2.5 text-right">{s.transaksi}</td>
                      <td className="px-3 py-2.5 text-right">{s.item}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
