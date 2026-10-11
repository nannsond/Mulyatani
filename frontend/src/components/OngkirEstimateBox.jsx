import { rupiah } from "@/lib/format";

export function OngkirEstimateBox({ berat, effOngkir }) {
  return (
    <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50/60 p-2.5 text-xs space-y-1.5" data-testid="ecom-ongkir-estimate">
      <div className="flex justify-between text-muted-foreground"><span>Berat total</span><span className="font-mono" data-testid="ecom-berat-total">{berat} kg</span></div>
      <div className="flex justify-between text-muted-foreground">
        <span>Ongkir</span>
        <span className="font-mono" data-testid="ecom-ongkir-est">-{rupiah(effOngkir)}</span>
      </div>
      <p className="text-amber-700">Ongkir final ditentukan platform saat dana cair, perbarui di tabel di bawah.</p>
    </div>
  );
}
