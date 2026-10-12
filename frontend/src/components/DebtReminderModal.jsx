import { useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { api } from "@/lib/api";
import { rupiah, fmtDate } from "@/lib/format";
import { useStoreInfo } from "@/components/InstallmentReceipt";

const toWaNumber = (p) => (p || "").replace(/\D/g, "").replace(/^0/, "62");

const buildText = (tx, info) => {
  const pays = tx.payments || [];
  const last = pays[pays.length - 1];
  return [
    `Halo ${tx.customer_name || "Bapak/Ibu"},`,
    "",
    `Kami dari *${info.store_name || "toko kami"}* ingin mengingatkan tagihan berikut:`,
    "",
    `No Invoice: ${tx.invoice_no}`,
    `Tanggal Transaksi: ${fmtDate(tx.created_at)}`,
    `Total Tagihan: ${rupiah(tx.total)}`,
    `Sudah Dibayar: ${rupiah(tx.amount_paid || 0)}`,
    `*Sisa Tagihan: ${rupiah(tx.sisa)}*`,
    last && `Pembayaran terakhir: ${fmtDate(last.date)}`,
    "",
    "Mohon dapat melakukan pembayaran pada kesempatan pertama. Abaikan pesan ini jika sudah membayar.",
    "",
    "Terima kasih.",
    info.phone && `${info.store_name || ""} - Telp ${info.phone}`.trim(),
  ].filter((l) => typeof l === "string").join("\n");
};

export const DebtReminderModal = ({ tx, onClose, onSent }) => {
  const { info } = useStoreInfo();
  const [phone, setPhone] = useState(tx.telepon || "");
  const [text, setText] = useState(() => buildText(tx, info));
  const number = toWaNumber(phone);

  const send = () => {
    window.open(`https://wa.me/${number}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
    api.post(`/transactions/${tx.id}/reminded`).then(onSent).catch(() => {});
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl w-full max-w-md p-6" data-testid="debt-reminder-modal">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-heading font-bold text-lg flex items-center gap-2"><MessageCircle className="w-5 h-5 text-[#25D366]" /> Tagih via WhatsApp</h3>
          <button onClick={onClose} data-testid="debt-reminder-close"><X className="w-5 h-5" /></button>
        </div>
        <label className="text-sm font-medium">No. WhatsApp pelanggan</label>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} data-testid="debt-reminder-phone" placeholder="08xxxxxxxxxx"
          className="mt-1 w-full px-3 py-2.5 rounded-xl border border-green-300 text-sm" />
        <label className="text-sm font-medium mt-3 block">Pesan</label>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={12} data-testid="debt-reminder-text"
          className="mt-1 w-full px-3 py-2 rounded-xl border border-input text-xs font-mono leading-relaxed" />
        <button onClick={send} disabled={number.length < 9} data-testid="debt-reminder-send"
          className="mt-4 w-full flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#1EBE5A] text-white py-2.5 rounded-xl font-semibold transition-colors disabled:opacity-50">
          <MessageCircle className="w-4 h-4" /> Kirim Pengingat
        </button>
      </div>
    </div>
  );
};
