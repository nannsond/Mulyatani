import { useState } from "react";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { api, apiError } from "@/lib/api";
import { toast } from "sonner";

const FIELDS = [
  { key: "current", label: "Password lama", testid: "change-pw-current" },
  { key: "next", label: "Password baru (min. 6 karakter)", testid: "change-pw-new" },
  { key: "confirm", label: "Ulangi password baru", testid: "change-pw-confirm" },
];

export const ChangePasswordDialog = ({ open, onOpenChange }) => {
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const close = (o) => { if (!o) { setForm({ current: "", next: "", confirm: "" }); setError(""); } onOpenChange(o); };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (form.next.length < 6) return setError("Password baru minimal 6 karakter");
    if (form.next !== form.confirm) return setError("Konfirmasi password tidak sama");
    setSaving(true);
    try {
      await api.post("/auth/change-password", { current_password: form.current, new_password: form.next });
      toast.success("Password berhasil diganti");
      close(false);
    } catch (err) { setError(apiError(err.response?.data?.detail)); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-sm" data-testid="change-pw-dialog">
        <DialogHeader>
          <DialogTitle>Ganti Password</DialogTitle>
          <DialogDescription>Gunakan password yang kuat dan jangan dibagikan.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          {FIELDS.map((f) => (
            <div key={f.key}>
              <label className="text-xs font-medium text-muted-foreground">{f.label}</label>
              <input type={show ? "text" : "password"} value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                data-testid={f.testid} required autoComplete={f.key === "current" ? "current-password" : "new-password"}
                className="w-full mt-1 px-3 py-2 rounded-lg border border-input text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5E3B]" />
            </div>
          ))}
          <button type="button" onClick={() => setShow((s) => !s)} data-testid="change-pw-toggle" className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
            {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />} {show ? "Sembunyikan" : "Tampilkan"} password
          </button>
          {error && <p className="text-sm text-destructive" data-testid="change-pw-error">{error}</p>}
          <DialogFooter>
            <button type="submit" disabled={saving} data-testid="change-pw-submit"
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#1B5E3B] text-white text-sm font-semibold hover:bg-[#143D2B] disabled:opacity-50">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} Simpan Password
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
