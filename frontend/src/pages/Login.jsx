import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { apiError } from "@/lib/api";
import { Sprout, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const u = await login(email, password);
      toast.success(`Selamat datang, ${u.name}!`);
      navigate("/");
    } catch (err) {
      setError(apiError(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  const demo = (em, pw) => { setEmail(em); setPassword(pw); };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:block relative">
        <img
          src="https://images.unsplash.com/photo-1691229219606-f9aa47d9cdef?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200"
          alt="Toko Pertanian"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0E241B] via-[#0E241B]/60 to-[#0E241B]/20" />
        <div className="absolute bottom-0 p-12 text-white">
          <h1 className="font-heading text-4xl font-extrabold mb-3 leading-tight">Kelola Toko Pertanian<br/>Lebih Cerdas</h1>
          <p className="text-emerald-100/80 max-w-md">Pencatatan penjualan, stok opname, dan laporan harian, bulanan & tahunan dalam satu sistem.</p>
        </div>
      </div>

      <div className="flex items-center justify-center p-6 bg-background">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-2xl bg-[#1B5E3B] flex items-center justify-center">
              <Sprout className="w-7 h-7 text-white" />
            </div>
            <div>
              <h2 className="font-heading font-bold text-xl text-[#0F281E]">Toko Pe-i Mulya Tani Caruban</h2>
              <p className="text-xs text-muted-foreground">Masuk ke akun Anda</p>
            </div>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-[#334E42]">Email</label>
              <input
                type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                data-testid="login-email-input"
                className="mt-1 w-full px-4 py-3 rounded-xl border border-input bg-white focus:outline-none focus:ring-2 focus:ring-[#1B5E3B] text-sm"
                placeholder="kasir@mulyatani.com"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-[#334E42]">Password</label>
              <input
                type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
                data-testid="login-password-input"
                className="mt-1 w-full px-4 py-3 rounded-xl border border-input bg-white focus:outline-none focus:ring-2 focus:ring-[#1B5E3B] text-sm"
                placeholder="admin123"
              />
            </div>
            {error && <p className="text-sm text-destructive" data-testid="login-error">{error}</p>}
            <button
              type="submit" disabled={loading}
              data-testid="login-submit-button"
              className="w-full bg-[#1B5E3B] hover:bg-[#143D2B] text-white py-3 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />} Masuk
            </button>
          </form>

          <div className="mt-6 space-y-2">
            <p className="text-xs text-muted-foreground text-center">Akun demo (klik untuk isi otomatis):</p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => demo("nannsond@gmail.com", "admin123")} data-testid="demo-admin-button"
                className="text-xs border border-input rounded-lg py-2 hover:bg-secondary transition-colors">
                Admin / Pemilik
              </button>
              <button onClick={() => demo("kasir@tokotani.com", "kasir123")} data-testid="demo-kasir-button"
                className="text-xs border border-input rounded-lg py-2 hover:bg-secondary transition-colors">
                Kasir
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
