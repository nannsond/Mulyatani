import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { rupiah } from "@/lib/format";

const toWaNumber = (p) => (p || "").replace(/\D/g, "").replace(/^0/, "62");

const buildText = (tx, store) => {
  const lines = [
    `*${store?.store_name || "Struk Belanja"}*`,
    store?.address, store?.phone && `Telp: ${store.phone}`,
    "",
    `No: ${tx.invoice_no}`,
    `Tanggal: ${new Date(tx.created_at).toLocaleString("id-ID")}`,
    tx.customer_name && `Pelanggan: ${tx.customer_name}`,
    "------------------------------",
    ...tx.items.map((i) => `${i.name}\n  ${i.qty} x ${rupiah(i.harga)} = ${rupiah(i.subtotal ?? i.qty * i.harga)}`),
    "------------------------------",
    `Subtotal: ${rupiah(tx.subtotal ?? tx.total)}`,
    tx.discount > 0 && `Diskon: -${rupiah(tx.discount)}`,
    tx.ongkir > 0 && `Ongkos Kirim: ${rupiah(tx.ongkir)}`,
    `*Total: ${rupiah(tx.total)}*`,
    `Bayar: ${tx.payment_method}`,
    tx.amount_paid < tx.total && `Dibayar: ${rupiah(tx.amount_paid)} | Sisa: ${rupiah(tx.total - tx.amount_paid)}`,
    "",
    "Terima kasih telah berbelanja!",
  ];
  return lines.filter((l) => typeof l === "string").join("\n");
};

export const WhatsAppReceipt = ({ tx, store }) => {
  const [phone, setPhone] = useState(tx.telepon || "");
  const number = toWaNumber(phone);
  const send = () => window.open(`https://wa.me/${number}?text=${encodeURIComponent(buildText(tx, store))}`, "_blank", "noopener,noreferrer");
  return (
    <div className="mt-2 flex gap-2" data-testid="pos-wa-receipt">
      <input value={phone} onChange={(e) => setPhone(e.target.value)} data-testid="pos-wa-phone-input"
        placeholder="No. WhatsApp pembeli" className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-green-300 text-sm bg-white" />
      <button onClick={send} disabled={number.length < 9} data-testid="pos-wa-send-button"
        className="flex items-center gap-1.5 bg-[#25D366] hover:bg-[#1EBE5A] text-white px-3 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50">
        <MessageCircle className="w-4 h-4" /> Kirim WA
      </button>
    </div>
  );
};
