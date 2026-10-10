import { useEffect, useState } from "react";
import { api, apiError } from "@/lib/api";
import { useSettings } from "@/context/SettingsContext";
import { Upload, Loader2, Image as ImageIcon, Store, Globe, Plus, Trash2, Power, Wallet, Percent } from "lucide-react";
import ChannelFeeEditor from "@/components/ChannelFeeEditor";
import PricingTargetCard from "@/components/PricingTargetCard";
import ShippingRatesCard from "@/components/ShippingRatesCard";
import { feeText } from "@/lib/fees";
import { toast } from "sonner";

export default function Pengaturan() {
  const { settings, refresh } = useSettings();
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [info, setInfo] = useState({ store_name: "", address: "", phone: "" });
  const [savingInfo, setSavingInfo] = useState(false);
  const [saldo, setSaldo] = useState(0);
  const [savingSaldo, setSavingSaldo] = useState(false);
  const [channels, setChannels] = useState([]);
  const [newCh, setNewCh] = useState({ name: "", color: "#2563eb" });
  const [feeOpen, setFeeOpen] = useState(null);
  const [feeDefaults, setFeeDefaults] = useState({});
  const loadChannels = () => api.get("/channels").then((r) => setChannels(r.data));
  useEffect(() => { loadChannels(); api.get("/channels/fee-defaults").then((r) => setFeeDefaults(r.data)); }, []);
  const addCh = async () => {
    if (!newCh.name.trim()) { toast.error("Nama channel wajib diisi"); return; }
    try { await api.post("/channels", newCh); toast.success("Channel ditambah"); setNewCh({ name: "", color: "#2563eb" }); loadChannels(); }
    catch (err) { toast.error(apiError(err.response?.data?.detail)); }
  };
  const toggleCh = async (c) => { await api.put(`/channels/${encodeURIComponent(c.name)}`, { active: !c.active }); loadChannels(); };
  const delCh = async (c) => { if (!window.confirm(`Hapus channel ${c.name}?`)) return; await api.delete(`/channels/${encodeURIComponent(c.name)}`); toast.success("Channel dihapus"); loadChannels(); };

  useEffect(() => {
    setInfo({
      store_name: settings?.store_name || "",
      address: settings?.address || "",
      phone: settings?.phone || "",
    });
    setSaldo(settings?.saldo_awal_kas || 0);
  }, [settings]);

  const saveSaldo = async (e) => {
    e.preventDefault();
    setSavingSaldo(true);
    try {
      await api.post("/settings/saldo-awal", { saldo_awal_kas: Number(saldo) || 0 });
      toast.success("Saldo awal kas disimpan");
      refresh();
    } catch (err) {
      toast.error(apiError(err.response?.data?.detail));
    } finally {
      setSavingSaldo(false);
    }
  };

  const logoUrl = settings?.has_logo
    ? `${process.env.REACT_APP_BACKEND_URL}/api/settings/logo?v=${encodeURIComponent(settings.logo_updated || "")}`
    : null;

  const onFile = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const upload = async () => {
    if (!file) return;
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await api.post("/settings/logo", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Logo toko diperbarui");
      setFile(null); setPreview(null);
      refresh();
    } catch (err) {
      toast.error(apiError(err.response?.data?.detail));
    } finally {
      setSaving(false);
    }
  };

  const saveInfo = async (e) => {
    e.preventDefault();
    setSavingInfo(true);
    try {
      await api.post("/settings/info", info);
      toast.success("Info toko disimpan");
      refresh();
    } catch (err) {
      toast.error(apiError(err.response?.data?.detail));
    } finally {
      setSavingInfo(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-5">
      <form onSubmit={saveInfo} className="bg-card rounded-2xl border border-slate-200 p-6">
        <h3 className="font-heading font-semibold text-lg text-[#0F281E] mb-1 flex items-center gap-2"><Store className="w-5 h-5 text-[#1B5E3B]" /> Info Toko</h3>
        <p className="text-sm text-muted-foreground mb-5">Nama, alamat, dan nomor telepon akan tercetak di struk penjualan.</p>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium">Nama Toko</label>
            <input value={info.store_name} onChange={(e) => setInfo({ ...info, store_name: e.target.value })} data-testid="info-store-name-input"
              placeholder="Toko Mulya Tani Caruban"
              className="mt-1 w-full px-3 py-2.5 rounded-xl border border-input text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5E3B]" />
          </div>
          <div>
            <label className="text-sm font-medium">Alamat</label>
            <textarea value={info.address} onChange={(e) => setInfo({ ...info, address: e.target.value })} data-testid="info-address-input"
              rows={2} placeholder="Jl. Raya Caruban No. 123, Madiun"
              className="mt-1 w-full px-3 py-2.5 rounded-xl border border-input text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5E3B]" />
          </div>
          <div>
            <label className="text-sm font-medium">No. Telepon</label>
            <input value={info.phone} onChange={(e) => setInfo({ ...info, phone: e.target.value })} data-testid="info-phone-input"
              placeholder="0812-3456-7890"
              className="mt-1 w-full px-3 py-2.5 rounded-xl border border-input text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5E3B]" />
          </div>
          <button type="submit" disabled={savingInfo} data-testid="info-save-button"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#1B5E3B] text-white text-sm font-semibold hover:bg-[#143D2B] disabled:opacity-50">
            {savingInfo && <Loader2 className="w-4 h-4 animate-spin" />} Simpan Info
          </button>
        </div>
      </form>

      <form onSubmit={saveSaldo} className="bg-card rounded-2xl border border-slate-200 p-6">
        <h3 className="font-heading font-semibold text-lg text-[#0F281E] mb-1 flex items-center gap-2"><Wallet className="w-5 h-5 text-[#1B5E3B]" /> Saldo Awal Kas</h3>
        <p className="text-sm text-muted-foreground mb-5">Jumlah uang fisik (laci/rekening) saat mulai memakai aplikasi. Dipakai untuk menghitung <b>Kas Saat Ini</b> di halaman Laba Rugi.</p>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="text-sm font-medium">Saldo Awal (Rp)</label>
            <input type="number" value={saldo} onChange={(e) => setSaldo(e.target.value)} data-testid="saldo-awal-input"
              placeholder="0" className="mt-1 w-full px-3 py-2.5 rounded-xl border border-input text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5E3B]" />
          </div>
          <button type="submit" disabled={savingSaldo} data-testid="saldo-save-button"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#1B5E3B] text-white text-sm font-semibold hover:bg-[#143D2B] disabled:opacity-50">
            {savingSaldo && <Loader2 className="w-4 h-4 animate-spin" />} Simpan
          </button>
        </div>
      </form>

      <div className="bg-card rounded-2xl border border-slate-200 p-6">
        <h3 className="font-heading font-semibold text-lg text-[#0F281E] mb-1">Logo Toko</h3>
        <p className="text-sm text-muted-foreground mb-5">Logo akan tampil di sidebar dan pada struk cetak. Format PNG/JPG/WEBP, maks 2MB.</p>

        <div className="flex items-center gap-6">
          <div className="w-28 h-28 rounded-2xl border border-dashed border-slate-300 bg-secondary/40 flex items-center justify-center overflow-hidden shrink-0">
            {preview ? (
              <img src={preview} alt="Preview" className="w-full h-full object-cover" data-testid="logo-preview" />
            ) : logoUrl ? (
              <img src={logoUrl} alt="Logo saat ini" className="w-full h-full object-cover" data-testid="logo-current" />
            ) : (
              <ImageIcon className="w-8 h-8 text-muted-foreground" />
            )}
          </div>

          <div className="space-y-3">
            <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-input text-sm font-medium cursor-pointer hover:bg-secondary" data-testid="logo-choose-label">
              <Upload className="w-4 h-4" /> Pilih Gambar
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onFile} className="hidden" data-testid="logo-file-input" />
            </label>
            {file && <p className="text-xs text-muted-foreground truncate max-w-[200px]">{file.name}</p>}
            <button onClick={upload} disabled={!file || saving} data-testid="logo-save-button"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#1B5E3B] text-white text-sm font-semibold hover:bg-[#143D2B] disabled:opacity-50">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} Simpan Logo
            </button>
          </div>
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-slate-200 p-6">
        <h3 className="font-heading font-semibold text-lg text-[#0F281E] mb-1 flex items-center gap-2"><Globe className="w-5 h-5 text-[#1B5E3B]" /> Channel Marketplace</h3>
        <p className="text-sm text-muted-foreground mb-5">Tambah, nonaktifkan, atau hapus channel penjualan online (Shopee, Tokopedia, Blibli, dll). Channel nonaktif tidak muncul saat input penjualan.</p>
        <p className="text-xs text-muted-foreground -mt-3 mb-5">Potongan default = referensi umum kebijakan tiap platform 2026 (toko non-Star/non-Mall). Tarif sebenarnya tergantung kategori & program yang diikuti, jadi sesuaikan dengan Seller Center toko Anda.</p>
        <div className="space-y-2 mb-4">
          {channels.map((c) => (
            <div key={c.name} className="p-3 rounded-xl border border-slate-200">
            <div className="flex items-center gap-3" data-testid={`channel-row-${c.name.replace(/\s+/g, "-").toLowerCase()}`}>
              <span className="w-5 h-5 rounded-md shrink-0" style={{ backgroundColor: c.color }} />
              <div className="flex-1 min-w-0">
                <span className={`text-sm font-medium ${c.active ? "" : "text-muted-foreground line-through"}`}>{c.name}</span>
                <p className="text-[11px] text-muted-foreground truncate" data-testid={`channel-fee-summary-${c.name.replace(/\s+/g, "-").toLowerCase()}`}>
                  {c.fees?.length ? c.fees.map((f) => `${f.label} ${feeText(f)}`).join(" • ") : "Belum ada potongan"}
                </p>
              </div>
              <button onClick={() => setFeeOpen(feeOpen === c.name ? null : c.name)} data-testid={`channel-fee-toggle-${c.name.replace(/\s+/g, "-").toLowerCase()}`} className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg font-semibold border border-input hover:bg-secondary"><Percent className="w-3.5 h-3.5" /> Potongan</button>
              <button onClick={() => toggleCh(c)} data-testid={`channel-toggle-${c.name.replace(/\s+/g, "-").toLowerCase()}`} className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg font-semibold ${c.active ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}><Power className="w-3.5 h-3.5" /> {c.active ? "Aktif" : "Nonaktif"}</button>
              <button onClick={() => delCh(c)} data-testid={`channel-delete-${c.name.replace(/\s+/g, "-").toLowerCase()}`} className="text-destructive"><Trash2 className="w-4 h-4" /></button>
            </div>
            {feeOpen === c.name && <ChannelFeeEditor channel={c} defaults={feeDefaults[c.name]} onSaved={() => { setFeeOpen(null); loadChannels(); }} />}
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input value={newCh.name} onChange={(e) => setNewCh({ ...newCh, name: e.target.value })} data-testid="channel-new-name" placeholder="Nama channel baru (mis. Blibli)" className="flex-1 px-3 py-2.5 rounded-xl border border-input text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5E3B]" />
          <input type="color" value={newCh.color} onChange={(e) => setNewCh({ ...newCh, color: e.target.value })} data-testid="channel-new-color" className="w-12 h-11 rounded-xl border border-input p-1" />
          <button onClick={addCh} data-testid="channel-add-button" className="flex items-center gap-1 px-4 rounded-xl bg-[#1B5E3B] text-white text-sm font-semibold hover:bg-[#143D2B]"><Plus className="w-4 h-4" /> Tambah</button>
        </div>
      </div>

      <ShippingRatesCard />

      <PricingTargetCard />
    </div>
  );
}
