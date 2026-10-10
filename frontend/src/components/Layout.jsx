import { useState } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useSettings } from "@/context/SettingsContext";
import { LayoutDashboard, ShoppingCart, Tag, Boxes, Calendar, BarChart3, TrendingUp, LogOut, Menu, X, Sprout, Users, ReceiptText, Settings, Truck, HandCoins, Banknote, Scale, ShoppingBag, Globe, Percent, Clock, Wallet, ClipboardList, MapPin, KeyRound } from "lucide-react";
import { ChangePasswordDialog } from "@/components/ChangePasswordDialog";

const LINKS = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/" },
  { label: "Kasir Penjualan", icon: ShoppingCart, path: "/pos" },
  { label: "Penjualan Online", icon: ShoppingBag, path: "/penjualan-online" },
  { label: "Riwayat Transaksi", icon: ReceiptText, path: "/riwayat" },
  { label: "Pengantaran", icon: MapPin, path: "/pengantaran" },
  { label: "Pembelian", icon: Truck, path: "/pembelian", adminOnly: true },
  { label: "Hutang & Piutang", icon: HandCoins, path: "/hutang-piutang" },
  { label: "Pengeluaran", icon: Banknote, path: "/pengeluaran", adminOnly: true },
  { label: "Daftar Harga", icon: Tag, path: "/daftar-harga" },
  { label: "Stok Opname", icon: Boxes, path: "/stok-opname" },
  { label: "Laporan Harian", icon: Calendar, path: "/laporan/harian" },
  { label: "Laporan Bulanan", icon: BarChart3, path: "/laporan/bulanan" },
  { label: "Laporan Tahunan", icon: TrendingUp, path: "/laporan/tahunan" },
  { label: "Laporan Online", icon: Globe, path: "/laporan/online" },
  { label: "Laba Rugi", icon: Scale, path: "/laporan/laba-rugi", adminOnly: true },
  { label: "Komisi Online", icon: Percent, path: "/komisi", adminOnly: true },
  { label: "Rekap Gaji", icon: Wallet, path: "/rekap-gaji", adminOnly: true },
  { label: "Kehadiran", icon: Clock, path: "/kehadiran" },
  { label: "Pengajuan Izin", icon: ClipboardList, path: "/pengajuan" },
  { label: "Kelola Kasir", icon: Users, path: "/kelola-kasir", adminOnly: true },
  { label: "Pengaturan", icon: Settings, path: "/pengaturan", adminOnly: true },
];

export function Layout({ children }) {
  const { user, logout } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);

  const current = LINKS.find((l) => l.path === location.pathname)?.label || "Dashboard";
  const links = LINKS.filter((l) => !l.adminOnly || user?.role === "admin");
  const logoSrc = settings?.has_logo ? `${process.env.REACT_APP_BACKEND_URL}/api/settings/logo?v=${encodeURIComponent(settings.logo_updated || "")}` : null;

  const handleLogout = () => { logout(); navigate("/login"); };

  const SidebarContent = () => (
    <>
      <div className="flex items-center gap-3 px-6 h-20 border-b border-[#1A3A2D]">
        <div className="w-10 h-10 rounded-xl bg-[#2D8A56] flex items-center justify-center overflow-hidden">
          {logoSrc ? <img src={logoSrc} alt="Logo" className="w-full h-full object-cover" data-testid="sidebar-logo" /> : <Sprout className="w-6 h-6 text-white" />}
        </div>
        <div>
          <h1 className="text-white font-heading font-bold text-base leading-tight">Toko Pe-i Mulya Tani Caruban</h1>
          <p className="text-[11px] text-emerald-300/70">Sistem Laporan Penjualan</p>
        </div>
      </div>
      <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto">
        {links.map((l) => (
          <NavLink
            key={l.path}
            to={l.path}
            onClick={() => setOpen(false)}
            data-testid={`nav-${l.path === "/" ? "dashboard" : l.path.replace(/\//g, "-").replace(/^-/, "")}`}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                isActive ? "bg-[#2D8A56] text-white" : "text-emerald-100/70 hover:bg-[#1A3A2D] hover:text-white"
              }`
            }
          >
            <l.icon className="w-[18px] h-[18px]" />
            {l.label}
          </NavLink>
        ))}
      </nav>
      <div className="p-4 border-t border-[#1A3A2D]">
        <div className="flex items-center gap-3 mb-3 px-2">
          <div className="w-9 h-9 rounded-full bg-[#C85A32] flex items-center justify-center text-white font-semibold text-sm">
            {user?.name?.[0]?.toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-white text-sm font-medium truncate">{user?.name}</p>
            <span className="text-[10px] uppercase tracking-wider font-semibold text-emerald-300/80">{user?.role}</span>
          </div>
        </div>
        <button
          onClick={() => { setOpen(false); setPwOpen(true); }}
          data-testid="change-password-button"
          className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm text-emerald-100/80 hover:bg-[#1A3A2D] hover:text-white transition-colors"
        >
          <KeyRound className="w-4 h-4" /> Ganti Password
        </button>
        <button
          onClick={handleLogout}
          data-testid="logout-button"
          className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm text-red-200 hover:bg-red-500/20 transition-colors"
        >
          <LogOut className="w-4 h-4" /> Keluar
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-background">
      <ChangePasswordDialog open={pwOpen} onOpenChange={setPwOpen} />
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-64 bg-[#0E241B] flex-col z-40">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <aside className="relative w-64 bg-[#0E241B] flex flex-col">
            <SidebarContent />
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 h-16 bg-white/95 backdrop-blur-md border-b border-slate-200 flex items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button className="lg:hidden" onClick={() => setOpen(true)} data-testid="mobile-menu-button">
              {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
            <div>
              <p className="text-xs text-muted-foreground">Toko Pe-i Mulya Tani Caruban</p>
              <h2 className="font-heading font-bold text-lg text-[#0F281E] leading-tight">{current}</h2>
            </div>
          </div>
          <button
            onClick={() => navigate("/pos")}
            data-testid="quick-new-transaction"
            className="hidden sm:flex items-center gap-2 bg-[#1B5E3B] hover:bg-[#143D2B] text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors"
          >
            <ShoppingCart className="w-4 h-4" /> Transaksi Baru
          </button>
        </header>
        <main className="p-4 sm:p-6 lg:p-8 animate-fade-up">{children}</main>
      </div>
    </div>
  );
}
