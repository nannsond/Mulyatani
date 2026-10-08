import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { Layout } from "@/components/Layout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import POS from "@/pages/POS";
import DaftarHarga from "@/pages/DaftarHarga";
import StokOpname from "@/pages/StokOpname";
import KelolaKasir from "@/pages/KelolaKasir";
import RiwayatTransaksi from "@/pages/RiwayatTransaksi";
import Pengaturan from "@/pages/Pengaturan";
import Pembelian from "@/pages/Pembelian";
import HutangPiutang from "@/pages/HutangPiutang";
import Pengeluaran from "@/pages/Pengeluaran";
import { SettingsProvider } from "@/context/SettingsContext";
import LaporanHarian from "@/pages/LaporanHarian";
import LaporanBulanan from "@/pages/LaporanBulanan";
import LaporanTahunan from "@/pages/LaporanTahunan";
import { Loader2 } from "lucide-react";

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-[#1B5E3B]" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Protected><Dashboard /></Protected>} />
      <Route path="/pos" element={<Protected><POS /></Protected>} />
      <Route path="/daftar-harga" element={<Protected><DaftarHarga /></Protected>} />
      <Route path="/stok-opname" element={<Protected><StokOpname /></Protected>} />
      <Route path="/laporan/harian" element={<Protected><LaporanHarian /></Protected>} />
      <Route path="/laporan/bulanan" element={<Protected><LaporanBulanan /></Protected>} />
      <Route path="/laporan/tahunan" element={<Protected><LaporanTahunan /></Protected>} />
      <Route path="/kelola-kasir" element={<Protected><KelolaKasir /></Protected>} />
      <Route path="/riwayat" element={<Protected><RiwayatTransaksi /></Protected>} />
      <Route path="/pengaturan" element={<Protected><Pengaturan /></Protected>} />
      <Route path="/pembelian" element={<Protected><Pembelian /></Protected>} />
      <Route path="/hutang-piutang" element={<Protected><HutangPiutang /></Protected>} />
      <Route path="/pengeluaran" element={<Protected><Pengeluaran /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <SettingsProvider>
        <BrowserRouter>
          <AppRoutes />
          <Toaster position="top-right" richColors />
        </BrowserRouter>
      </SettingsProvider>
    </AuthProvider>
  );
}

export default App;
