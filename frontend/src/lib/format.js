export const rupiah = (n) =>
  "Rp " + Math.round(n || 0).toLocaleString("id-ID");

export const MONTHS = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];

export const fmtDate = (iso) => {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
};

export const fmtDateTime = (iso) => {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

export const todayStr = () => new Date().toISOString().slice(0, 10);

export const fmtJam = (iso) => iso ? new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }) : "-";

export const fmtDurasi = (m) => {
  const mins = Math.max(0, Math.round(m || 0));
  return `${Math.floor(mins / 60)}j ${mins % 60}m`;
};

export const ECOM_CHANNELS = ["Shopee", "Tokopedia", "Lazada", "TikTok Shop"];

export const CHANNEL_COLORS = {
  "Shopee": "#EE4D2D",
  "Tokopedia": "#42B549",
  "Lazada": "#2E4CE5",
  "TikTok Shop": "#111827",
};
