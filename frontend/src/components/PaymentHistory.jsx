import { rupiah, fmtDate } from "@/lib/format";
import { InstallmentReceipt } from "@/components/InstallmentReceipt";

export const PaymentHistory = ({ doc, kind }) => {
  const pays = doc.payments || [];
  const initial = Math.max(0, (doc.amount_paid || 0) - pays.reduce((s, p) => s + (p.amount || 0), 0));
  const rows = [
    ...(initial > 0 ? [{ label: kind === "piutang" ? "Bayar awal (saat transaksi)" : "Bayar awal (saat pembelian)", date: doc.created_at, amount: initial, by: "" }] : []),
    ...pays.map((p, i) => ({ label: `Cicilan ke-${i + 1}`, date: p.date, amount: p.amount, by: p.by, idx: i })),
  ];
  let running = 0;
  return (
    <div className="bg-secondary/40 rounded-xl p-4" data-testid={`hp-history-${doc.id}`}>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Riwayat Pembayaran</p>
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">Belum ada pembayaran.</p> : (
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-muted-foreground">
            <th className="py-1.5 font-medium">Keterangan</th><th className="py-1.5 font-medium">Tanggal Bayar</th><th className="py-1.5 font-medium">Dicatat oleh</th>
            <th className="py-1.5 font-medium text-right">Jumlah</th><th className="py-1.5 font-medium text-right">Sisa Setelah Bayar</th>
            {kind === "piutang" && <th className="py-1.5 w-10" />}
          </tr></thead>
          <tbody>
            {rows.map((r, i) => {
              running += r.amount;
              return (
                <tr key={i} className="border-t border-slate-200/70" data-testid={`hp-history-row-${doc.id}-${i}`}>
                  <td className="py-1.5">{r.label}</td>
                  <td className="py-1.5 text-xs">{fmtDate(r.date)}</td>
                  <td className="py-1.5 text-xs text-muted-foreground">{r.by || "-"}</td>
                  <td className="py-1.5 text-right font-mono font-semibold text-[#1B5E3B]">{rupiah(r.amount)}</td>
                  <td className="py-1.5 text-right font-mono">{rupiah(Math.max(0, doc.total - running))}</td>
                  {kind === "piutang" && <td className="py-1.5 text-center">{r.idx !== undefined && <InstallmentReceipt tx={doc} idx={r.idx} compact />}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
};
