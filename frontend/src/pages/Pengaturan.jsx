import { useEffect, useState } from "react";
import { api, apiError } from "@/lib/api";
import { useSettings } from "@/context/SettingsContext";
import { Upload, Loader2, Image as ImageIcon, Store } from "lucide-react";
import { toast } from "sonner";

export default function Pengaturan() {
  const { settings, refresh } = useSettings();
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [info, setInfo] = useState({ store_name: "", address: "", phone: "" });
  const [savingInfo, setSavingInfo] = useState(false);

  useEffect(() => {
    setInfo({
      store_name: settings?.store_name || "",
      address: settings?.address || "",
      phone: settings?.phone || "",
    });
  }, [settings]);

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
    </div>
  );
}
