import { useEffect, useState } from "react";
import { api, apiError } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import { UserPlus, Pencil, Trash2, X, ShieldCheck, User } from "lucide-react";
import { toast } from "sonner";

const EMPTY = { name: "", email: "", password: "", role: "kasir" };

export default function KelolaKasir() {
  const [users, setUsers] = useState([]);
  const [modal, setModal] = useState(null);

  const load = () => api.get("/users").then((r) => setUsers(r.data));
  useEffect(() => { load(); }, []);

  const save = async (e) => {
    e.preventDefault();
    try {
      if (modal.id) await api.put(`/users/${modal.id}`, modal);
      else await api.post("/users", modal);
      toast.success("Akun disimpan");
      setModal(null); load();
    } catch (err) { toast.error(apiError(err.response?.data?.detail)); }
  };

  const del = async (id) => {
    if (!window.confirm("Hapus akun ini?")) return;
    try {
      await api.delete(`/users/${id}`);
      toast.success("Akun dihapus"); load();
    } catch (err) { toast.error(apiError(err.response?.data?.detail)); }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Kelola akun admin & kasir toko.</p>
        <button onClick={() => setModal({ ...EMPTY })} data-testid="user-add-trigger"
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#1B5E3B] text-white text-sm font-semibold hover:bg-[#143D2B]"><UserPlus className="w-4 h-4" /> Tambah Akun</button>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {users.map((u) => (
          <div key={u.id} className="bg-card rounded-2xl border border-slate-200 p-5" data-testid={`user-card-${u.id}`}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-white ${u.role === "admin" ? "bg-[#1B5E3B]" : "bg-[#C85A32]"}`}>
                  {u.role === "admin" ? <ShieldCheck className="w-5 h-5" /> : <User className="w-5 h-5" />}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-[#0F281E] truncate">{u.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between mt-4">
              <span className={`text-[10px] uppercase tracking-wider font-semibold px-2.5 py-1 rounded-lg ${u.role === "admin" ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"}`}>{u.role}</span>
              <div className="flex gap-1">
                <button onClick={() => setModal({ ...u, password: "" })} data-testid={`user-edit-${u.id}`} className="w-8 h-8 rounded-lg hover:bg-secondary flex items-center justify-center"><Pencil className="w-4 h-4" /></button>
                <button onClick={() => del(u.id)} data-testid={`user-delete-${u.id}`} className="w-8 h-8 rounded-lg text-destructive hover:bg-red-50 flex items-center justify-center"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setModal(null)} />
          <form onSubmit={save} className="relative bg-white rounded-2xl w-full max-w-md p-6" data-testid="user-modal">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-heading font-bold text-lg">{modal.id ? "Edit Akun" : "Tambah Akun"}</h3>
              <button type="button" onClick={() => setModal(null)}><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium">Nama</label>
                <input value={modal.name} onChange={(e) => setModal({ ...modal, name: e.target.value })} required data-testid="user-name-input"
                  className="mt-1 w-full px-3 py-2.5 rounded-xl border border-input text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5E3B]" />
              </div>
              <div>
                <label className="text-sm font-medium">Email</label>
                <input type="email" value={modal.email} onChange={(e) => setModal({ ...modal, email: e.target.value })} required data-testid="user-email-input"
                  className="mt-1 w-full px-3 py-2.5 rounded-xl border border-input text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5E3B]" />
              </div>
              <div>
                <label className="text-sm font-medium">Password {modal.id && <span className="text-muted-foreground font-normal">(kosongkan jika tidak diubah)</span>}</label>
                <input type="password" value={modal.password} onChange={(e) => setModal({ ...modal, password: e.target.value })} required={!modal.id} data-testid="user-password-input"
                  className="mt-1 w-full px-3 py-2.5 rounded-xl border border-input text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5E3B]" />
              </div>
              <div>
                <label className="text-sm font-medium">Role</label>
                <select value={modal.role} onChange={(e) => setModal({ ...modal, role: e.target.value })} data-testid="user-role-select"
                  className="mt-1 w-full px-3 py-2.5 rounded-xl border border-input text-sm bg-white">
                  <option value="kasir">Kasir</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>
            <button type="submit" data-testid="user-save-button" className="mt-5 w-full bg-[#1B5E3B] text-white py-3 rounded-xl font-semibold hover:bg-[#143D2B]">Simpan</button>
          </form>
        </div>
      )}
    </div>
  );
}
