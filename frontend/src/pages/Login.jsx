import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { apiError } from "@/lib/api";
import { Loader2 } from "lucide-react";
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

  const demo = () => {};

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex relative flex-col items-center justify-center p-12 bg-gradient-to-br from-white via-emerald-50 to-[#E6F0E9]">
        <img
          src="/mulyatani-logo.png"
          alt="Mulya Tani"
          className="w-72 h-72 object-contain drop-shadow-sm"
        />
        <div className="mt-8 text-center">
          <h1 className="font-heading text-3xl font-extrabold mb-3 leading-tight text-[#0F281E]">Kelola Toko Pertanian<br/>Lebih Cerdas</h1>
          <p className="text-[#334E42]/80 max-w-md mx-auto">Pencatatan penjualan, stok opname, dan laporan harian, bulanan & tahunan dalam satu sistem.</p>
        </div>
      </div>

      <div className="flex items-center justify-center p-6 bg-background">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 flex items-center justify-center overflow-hidden">
              <img src="/mulyatani-logo.png" alt="Mulya Tani" className="w-11 h-11 object-contain" />
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
                placeholder="••••••••"
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
        </div>
      </div>
    </div>
  );
}
