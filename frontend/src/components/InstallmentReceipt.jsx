import { useState } from "react";
import { MessageCircle, Printer } from "lucide-react";
import { rupiah } from "@/lib/format";
import { printInstallmentReceipt } from "@/lib/exporter";
import { useSettings } from "@/context/SettingsContext";

const toWaNumber = (p) => (p || "").replace(/\D/g, "").replace(/^0/, "62");

const buildText = (tx, idx, store) => {
  const pays = tx.payments || [];
  const pay = pays[idx];
  const paidUpTo = Math.max(0, (tx.amount_paid || 0) - pays.slice(idx + 1).reduce((s, p) => s + (p.amount || 0), 0));
  const sisa = Math.max(0, tx.total - paidUpTo);
  return [
    `*${store?.store_name || "Bukti Pembayaran"}*`,
    "*BUKTI PEMBAYARAN CICILAN*",
    "",
    `No Invoice: ${tx.invoice_no}`,
    tx.customer_name && `Pelanggan: ${tx.customer_name}`,
    `Total Tagihan: ${rupiah(tx.total)}`,
    "------------------------------",
    `*Cicilan ke-${idx + 1}: ${rupiah(pay.amount)}*`,
    `Tanggal Bayar: ${new Date(pay.date).toLocaleDateString("id-ID")}`,
    `Total Dibayar: ${rupiah(paidUpTo)}`,
    sisa > 0 ? `Sisa Piutang: ${rupiah(sisa)}` : "Status: *LUNAS*",
    "",
    "Terima kasih atas pembayarannya!",
  ].filter((l) => typeof l === "string").join("\n");
};

export const useStoreInfo = () => {
  const { settings } = useSettings();
  const logoUrl = settings?.has_logo ? `${process.env.REACT_APP_BACKEND_URL}/api/settings/logo?v=${encodeURIComponent(settings.logo_updated || "")}` : undefined;
  return { logoUrl, info: { store_name: settings?.store_name, address: settings?.address, phone: settings?.phone } };
};

export const InstallmentReceipt = ({ tx, idx, compact = false }) => {
  const { logoUrl, info } = useStoreInfo();
  const [phone, setPhone] = useState(tx.telepon || "");
  const number = toWaNumber(phone);
  const tid = `${tx.id}-${idx}`;
  const print = () => printInstallmentReceipt(tx, idx, logoUrl, info);
  const send = () => window.open(`https://wa.me/${number}?text=${encodeURIComponent(buildText(tx, idx, info))}`, "_blank", "noopener,noreferrer");

  if (compact) return (
    <button onClick={print} title="Cetak bukti cicilan" data-testid={`installment-print-${tid}`} className="p-1 rounded text-muted-foreground hover:text-[#1B5E3B] hover:bg-secondary"><Printer className="w-3.5 h-3.5" /></button>
  );
  return (
    <div className="space-y-2" data-testid="installment-receipt">
      <button onClick={print} data-testid={`installment-print-${tid}`} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-input text-sm font-semibold hover:bg-secondary">
        <Printer className="w-4 h-4" /> Cetak Bukti (PDF)
      </button>
      <div className="flex gap-2">
        <input value={phone} onChange={(e) => setPhone(e.target.value)} data-testid="installment-wa-phone" placeholder="No. WhatsApp pelanggan"
          className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-green-300 text-sm bg-white" />
        <button onClick={send} disabled={number.length < 9} data-testid="installment-wa-send"
          className="flex items-center gap-1.5 bg-[#25D366] hover:bg-[#1EBE5A] text-white px-3 py-2 rounded-lg text-sm font-semibold disabled:opacity-50">
          <MessageCircle className="w-4 h-4" /> Kirim WA
        </button>
      </div>
    </div>
  );
};
