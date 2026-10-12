import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { rupiah, fmtDateTime, fmtDate, todayStr, MONTHS } from "@/lib/format";
import { MapPin, MessageCircle, Loader2, PackageCheck, Clock, Truck, Archive, ArchiveRestore, CalendarClock } from "lucide-react";
import { toast } from "sonner";

const TABS = [
  { key: "", label: "Semua" },
  { key: "belum", label: "Belum Diantar" },
  { key: "diantar", label: "Sedang Diantar" },
  { key: "selesai", label: "Selesai" },
  { key: "arsip", label: "Arsip" },
];

const STATUS_STYLE = {
  belum: "bg-amber-100 text-amber-700",
  diantar: "bg-blue-100 text-blue-700",
  selesai: "bg-emerald-100 text-emerald-700",
};
const STATUS_LABEL = { belum: "Belum Diantar", diantar: "Sedang Diantar", selesai: "Selesai" };

function DeliveryBadges({ d, today }) {
  if (d.status_antar === "selesai") return null;
  const tags = [];
  if (d.dari_bulan_lalu) tags.push(["Dari bulan lalu", "bg-purple-100 text-purple-700", "lalu"]);
  if (d.jadwal_antar && d.jadwal_antar < today) tags.push(["Terlambat", "bg-red-100 text-red-700", "telat"]);
  else if (d.jadwal_antar === today) tags.push(["Antar hari ini", "bg-emerald-100 text-emerald-700", "hari-ini"]);
  else if (d.jadwal_antar > today) tags.push(["Terjadwal", "bg-sky-100 text-sky-700", "nanti"]);
  if (!tags.length) return null;
  return (
    <div className="flex gap-1.5 flex-wrap">
      {tags.map(([label, cls, key]) => <span key={key} data-testid={`delivery-badge-${key}-${d.id}`} className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${cls}`}>{label}</span>)}
    </div>
  );
}

export default function Pengantaran() {
  const [tab, setTab] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  const archivedView = tab === "arsip";
  const load = () => {
    setLoading(true);
    const params = { year, month, ...(tab === "arsip" ? { archived: true } : tab ? { status: tab } : {}) };
    api.get("/deliveries", { params }).then((r) => setRows(r.data)).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(load, [tab, month, year]); // eslint-disable-line react-hooks/exhaustive-deps
  const totalOngkir = rows.filter((d) => !d.dari_bulan_lalu).reduce((s, d) => s + (d.ongkir || 0), 0);

  const setStatus = async (id, status_antar) => {
    try {
      await api.put(`/deliveries/${id}/status`, { status_antar });
      toast.success("Status pengantaran diperbarui");
      load();
    } catch (e) {
      toast.error("Gagal memperbarui status");
    }
  };

  const setArsip = async (id, arsip) => {
    try {
      await api.put(`/deliveries/${id}/archive`, { arsip });
      toast.success(arsip ? "Pesanan diarsipkan" : "Pesanan dikeluarkan dari arsip");
      load();
    } catch (e) {
      toast.error("Gagal memperbarui arsip");
    }
  };

  const setJadwal = async (id, jadwal_antar) => {
    try {
      await api.put(`/deliveries/${id}/schedule`, { jadwal_antar });
      toast.success(jadwal_antar ? `Dijadwalkan ${fmtDate(jadwal_antar)}` : "Jadwal dihapus");
      load();
    } catch (e) {
      toast.error("Gagal menyimpan jadwal");
    }
  };

  const today = todayStr();
  const planDate = (d) => d.jadwal_antar || d.created_at.slice(0, 10);
  const sorted = [...rows].sort((a, b) => {
    const da = a.status_antar === "selesai", db = b.status_antar === "selesai";
    if (da !== db) return da ? 1 : -1;
    return da ? b.created_at.localeCompare(a.created_at) : planDate(a).localeCompare(planDate(b));
  });

  const waLink = (p) => `https://wa.me/${(p || "").replace(/\D/g, "").replace(/^0/, "62")}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-[#0F281E]">Daftar Pengantaran</h1>
          <p className="text-sm text-muted-foreground">Pesanan yang perlu diantar ke alamat pembeli</p>
        </div>
        <div className="flex gap-2">
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))} data-testid="delivery-month-select"
            className="px-4 py-2.5 rounded-xl border border-input bg-card text-sm">
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} data-testid="delivery-year-select"
            className="px-4 py-2.5 rounded-xl border border-input bg-card text-sm">
            {[0, 1, 2].map((d) => <option key={d} value={now.getFullYear() - d}>{now.getFullYear() - d}</option>)}
          </select>
        </div>
      </div>

      <p className="text-sm text-muted-foreground" data-testid="delivery-month-summary">
        {MONTHS[month - 1]} {year}: <span className="font-semibold text-[#0F281E]">{rows.length} pesanan</span> · Total ongkir <span className="font-mono font-semibold text-[#1B5E3B]">{rupiah(totalOngkir)}</span>
        {rows.some((d) => d.dari_bulan_lalu) && <span className="text-purple-700"> · termasuk pesanan bulan lalu yang belum selesai</span>}
      </p>

      <div className="flex gap-2 flex-wrap">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} data-testid={`delivery-tab-${t.key || "all"}`}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${tab === t.key ? "bg-[#1B5E3B] text-white" : "bg-card border border-slate-200 hover:bg-secondary"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-[#1B5E3B]" /></div>
      ) : rows.length === 0 ? (
        <div className="bg-card rounded-2xl border border-slate-200 p-12 text-center text-muted-foreground">
          <Truck className="w-10 h-10 mx-auto mb-3 opacity-40" />
          Tidak ada pesanan untuk diantar di bulan ini.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sorted.map((d) => (
            <div key={d.id} className="bg-card rounded-2xl border border-slate-200 p-5 space-y-3" data-testid={`delivery-card-${d.id}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-mono text-xs text-muted-foreground">{d.invoice_no}</p>
                  <p className="font-semibold text-[#0F281E]">{d.customer_name || "Tanpa nama"}</p>
                </div>
                <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${STATUS_STYLE[d.status_antar] || STATUS_STYLE.belum}`}>{STATUS_LABEL[d.status_antar] || "Belum Diantar"}</span>
              </div>
              <p className="text-xs text-muted-foreground">Order: {fmtDateTime(d.created_at)}</p>
              <DeliveryBadges d={d} today={today} />
              {!archivedView && d.status_antar !== "selesai" ? (
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <CalendarClock className="w-4 h-4 text-[#1B5E3B]" /> Jadwal antar
                  <input type="date" value={d.jadwal_antar || ""} onChange={(e) => setJadwal(d.id, e.target.value)} data-testid={`delivery-jadwal-${d.id}`}
                    className="flex-1 px-2 py-1.5 rounded-lg border border-input text-xs text-foreground" />
                </label>
              ) : d.jadwal_antar ? (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5"><CalendarClock className="w-4 h-4" /> Jadwal antar: {fmtDate(d.jadwal_antar)}</p>
              ) : null}
              {d.alamat && <div className="flex gap-2 text-sm"><MapPin className="w-4 h-4 text-[#1B5E3B] shrink-0 mt-0.5" /><span>{d.alamat}</span></div>}
              {d.telepon && (
                <a href={waLink(d.telepon)} target="_blank" rel="noopener noreferrer" data-testid={`delivery-wa-${d.id}`}
                  className="inline-flex items-center gap-1.5 text-sm text-[#1B5E3B] font-medium hover:underline">
                  <MessageCircle className="w-4 h-4" /> {d.telepon}
                </a>
              )}
              <div className="text-xs text-muted-foreground border-t border-slate-100 pt-2 space-y-0.5">
                {d.items.map((i, idx) => <div key={idx} className="truncate">{i.qty} x {i.name}</div>)}
              </div>
              <div className="flex justify-between text-sm pt-1">
                <span className="text-muted-foreground">Ongkir {rupiah(d.ongkir || 0)}</span>
                <span className="font-mono font-bold text-[#1B5E3B]">{rupiah(d.total)}</span>
              </div>
              <div className="flex gap-2 pt-1 flex-wrap">
                {archivedView ? (
                  <button onClick={() => setArsip(d.id, false)} data-testid={`delivery-unarchive-${d.id}`}
                    className="flex-1 inline-flex items-center justify-center gap-1 text-xs font-semibold py-2 rounded-lg border border-input hover:bg-secondary"><ArchiveRestore className="w-3.5 h-3.5" /> Keluarkan dari Arsip</button>
                ) : (
                  <>
                    {d.status_antar !== "diantar" && d.status_antar !== "selesai" && (
                      <button onClick={() => setStatus(d.id, "diantar")} data-testid={`delivery-set-diantar-${d.id}`}
                        className="flex-1 inline-flex items-center justify-center gap-1 text-xs font-semibold py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"><Truck className="w-3.5 h-3.5" /> Diantar</button>
                    )}
                    {d.status_antar !== "selesai" && (
                      <button onClick={() => setStatus(d.id, "selesai")} data-testid={`delivery-set-selesai-${d.id}`}
                        className="flex-1 inline-flex items-center justify-center gap-1 text-xs font-semibold py-2 rounded-lg bg-[#1B5E3B] text-white hover:bg-[#143D2B]"><PackageCheck className="w-3.5 h-3.5" /> Selesai</button>
                    )}
                    {d.status_antar === "selesai" && (
                      <>
                        <button onClick={() => setStatus(d.id, "belum")} data-testid={`delivery-set-belum-${d.id}`}
                          className="flex-1 inline-flex items-center justify-center gap-1 text-xs font-semibold py-2 rounded-lg border border-input hover:bg-secondary"><Clock className="w-3.5 h-3.5" /> Set Belum</button>
                        <button onClick={() => setArsip(d.id, true)} data-testid={`delivery-archive-${d.id}`}
                          className="flex-1 inline-flex items-center justify-center gap-1 text-xs font-semibold py-2 rounded-lg bg-slate-600 text-white hover:bg-slate-700"><Archive className="w-3.5 h-3.5" /> Arsipkan</button>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
