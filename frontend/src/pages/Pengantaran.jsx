import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { rupiah, fmtDateTime } from "@/lib/format";
import { MapPin, MessageCircle, Loader2, PackageCheck, Clock, Truck } from "lucide-react";
import { toast } from "sonner";

const TABS = [
  { key: "", label: "Semua" },
  { key: "belum", label: "Belum Diantar" },
  { key: "diantar", label: "Sedang Diantar" },
  { key: "selesai", label: "Selesai" },
];

const STATUS_STYLE = {
  belum: "bg-amber-100 text-amber-700",
  diantar: "bg-blue-100 text-blue-700",
  selesai: "bg-emerald-100 text-emerald-700",
};
const STATUS_LABEL = { belum: "Belum Diantar", diantar: "Sedang Diantar", selesai: "Selesai" };

export default function Pengantaran() {
  const [tab, setTab] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.get(`/deliveries${tab ? `?status=${tab}` : ""}`).then((r) => setRows(r.data)).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(() => {
    setLoading(true);
    api.get(`/deliveries${tab ? `?status=${tab}` : ""}`).then((r) => setRows(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, [tab]);

  const setStatus = async (id, status_antar) => {
    try {
      await api.put(`/deliveries/${id}/status`, { status_antar });
      toast.success("Status pengantaran diperbarui");
      load();
    } catch (e) {
      toast.error("Gagal memperbarui status");
    }
  };

  const waLink = (p) => `https://wa.me/${(p || "").replace(/\D/g, "").replace(/^0/, "62")}`;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-heading text-2xl font-bold text-[#0F281E]">Daftar Pengantaran</h1>
        <p className="text-sm text-muted-foreground">Pesanan yang perlu diantar ke alamat pembeli</p>
      </div>

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
          Tidak ada pesanan untuk diantar.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((d) => (
            <div key={d.id} className="bg-card rounded-2xl border border-slate-200 p-5 space-y-3" data-testid={`delivery-card-${d.id}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-mono text-xs text-muted-foreground">{d.invoice_no}</p>
                  <p className="font-semibold text-[#0F281E]">{d.customer_name || "Tanpa nama"}</p>
                </div>
                <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${STATUS_STYLE[d.status_antar] || STATUS_STYLE.belum}`}>{STATUS_LABEL[d.status_antar] || "Belum Diantar"}</span>
              </div>
              <p className="text-xs text-muted-foreground">{fmtDateTime(d.created_at)}</p>
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
              <div className="flex gap-2 pt-1">
                {d.status_antar !== "diantar" && d.status_antar !== "selesai" && (
                  <button onClick={() => setStatus(d.id, "diantar")} data-testid={`delivery-set-diantar-${d.id}`}
                    className="flex-1 inline-flex items-center justify-center gap-1 text-xs font-semibold py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"><Truck className="w-3.5 h-3.5" /> Diantar</button>
                )}
                {d.status_antar !== "selesai" && (
                  <button onClick={() => setStatus(d.id, "selesai")} data-testid={`delivery-set-selesai-${d.id}`}
                    className="flex-1 inline-flex items-center justify-center gap-1 text-xs font-semibold py-2 rounded-lg bg-[#1B5E3B] text-white hover:bg-[#143D2B]"><PackageCheck className="w-3.5 h-3.5" /> Selesai</button>
                )}
                {d.status_antar === "selesai" && (
                  <button onClick={() => setStatus(d.id, "belum")} data-testid={`delivery-set-belum-${d.id}`}
                    className="flex-1 inline-flex items-center justify-center gap-1 text-xs font-semibold py-2 rounded-lg border border-input hover:bg-secondary"><Clock className="w-3.5 h-3.5" /> Set Belum</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
