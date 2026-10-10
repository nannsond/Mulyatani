import { useEffect, useState } from "react";
import { MessageCircle, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { api, apiError } from "@/lib/api";
import { rupiah } from "@/lib/format";
import { toast } from "sonner";

const toWaNumber = (p) => (p || "").replace(/\D/g, "").replace(/^0/, "62");

const buildSlipText = (row, monthLabel, storeName) => {
  const bonus = (row.bonus_items || []).map((b) => `• Bonus ${b.keterangan}: ${rupiah(b.jumlah)}`);
  const lain = (row.potongan_items || []).map((p) => `• ${p.keterangan}: ${rupiah(p.jumlah)}`);
  const bruto = (row.gaji_pokok || 0) + (row.komisi || 0) + (row.bonus_items || []).reduce((s, b) => s + (Number(b.jumlah) || 0), 0);
  const totPot = (row.potongan || 0) + (row.potongan_lain || 0);
  return [
    `*SLIP GAJI KARYAWAN*`, storeName || "", `Periode: ${monthLabel}`, "",
    `Nama: ${row.user_name}`,
    `Kehadiran: Hadir ${row.hadir || 0} hari, Telat ${row.telat || 0} kali, Alpha ${row.alpha || 0} hari, Izin/Sakit ${row.izin || 0} hari`, "",
    "*Pendapatan*",
    `• Gaji Pokok: ${rupiah(row.gaji_pokok)}`,
    ...(row.komisi > 0 ? [`• Komisi Online: ${rupiah(row.komisi)}`] : []),
    ...bonus,
    `Total Pendapatan Kotor: ${rupiah(bruto)}`, "",
    "*Potongan*",
    `• Absensi/Keterlambatan: ${rupiah(row.potongan)}`,
    ...lain,
    `Total Potongan: ${rupiah(totPot)}`, "",
    `*TOTAL GAJI BERSIH: ${rupiah(bruto - totPot)}*`, "",
    "Slip PDF terlampir. Terima kasih atas kerja kerasnya!",
  ].join("\n");
};

export const PayslipWhatsAppDialog = ({ open, onOpenChange, row, monthLabel, storeName, onPrint, onPhoneSaved }) => {
  const [phone, setPhone] = useState("");
  const [sending, setSending] = useState(false);
  useEffect(() => { if (open) setPhone(row?.telepon || ""); }, [open, row]);
  const number = toWaNumber(phone);

  const send = async () => {
    setSending(true);
    const win = window.open("", "_blank");
    try {
      if (phone.trim() !== (row.telepon || "")) {
        await api.post("/payroll/phone", { user_id: row.user_id, telepon: phone.trim() });
        onPhoneSaved?.(row.user_id, phone.trim());
      }
      const url = `https://wa.me/${number}?text=${encodeURIComponent(buildSlipText(row, monthLabel, storeName))}`;
      if (win) win.location.href = url; else window.open(url, "_blank");
      await onPrint();
      toast.success("WhatsApp dibuka & slip PDF diunduh — lampirkan PDF di chat");
      onOpenChange(false);
    } catch (err) {
      win?.close();
      toast.error(apiError(err.response?.data?.detail));
    } finally { setSending(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="payslip-wa-dialog">
        <DialogHeader><DialogTitle>Kirim Slip Gaji via WhatsApp</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">{row?.user_name} • {monthLabel}</p>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} data-testid="payslip-wa-phone-input" placeholder="No. WhatsApp karyawan (08xx)"
            className="w-full px-3 py-2 rounded-lg border border-input text-sm" />
          <p className="text-xs text-muted-foreground">Nomor disimpan untuk bulan berikutnya. Ringkasan slip dikirim sebagai pesan, dan PDF slip otomatis diunduh agar bisa dilampirkan.</p>
        </div>
        <DialogFooter>
          <button onClick={send} disabled={number.length < 9 || sending} data-testid="payslip-wa-send-button"
            className="flex items-center gap-2 bg-[#25D366] hover:bg-[#1EBE5A] text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />} Kirim WA
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
