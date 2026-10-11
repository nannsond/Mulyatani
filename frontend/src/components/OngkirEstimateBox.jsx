import { rupiah } from "@/lib/format";

const sel = "flex-1 min-w-0 px-2 py-1.5 rounded-lg border border-input bg-white text-xs";

function PlatformPicker({ table, value, onChange }) {
  const svc = table.services.find((s) => s.name === value.layanan);
  return (
    <>
      <div className="flex items-center gap-2">
        <span className="font-semibold text-[#0F281E] w-24 shrink-0">Layanan</span>
        <select value={value.layanan || ""} onChange={(e) => onChange({ ...value, layanan: e.target.value, rute: "" })} data-testid="ecom-layanan-select" className={sel}>
          <option value="">-- Pilih layanan --</option>
          {table.services.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <span className="font-semibold text-[#0F281E] w-24 shrink-0">Rute</span>
        <select value={value.rute || ""} onChange={(e) => onChange({ ...value, rute: e.target.value })} disabled={!svc} data-testid="ecom-rute-select" className={sel}>
          <option value="">-- Pilih rute --</option>
          {svc?.routes.map((r) => { const l = `${r.zona_a} ↔ ${r.zona_b}`; return <option key={l} value={l}>{l}</option>; })}
        </select>
      </div>
    </>
  );
}

export function OngkirEstimateBox({ shipping, value, onChange, est, berat, effOngkir, manual, channel }) {
  return (
    <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50/60 p-2.5 text-xs space-y-1.5" data-testid="ecom-ongkir-estimate">
      {est.table ? (
        <>
          <p className="font-semibold text-[#0F281E]">Biaya Layanan Logistik {channel}</p>
          <PlatformPicker table={est.table} value={value} onChange={onChange} />
        </>
      ) : (
        <div className="flex items-center gap-2">
          <span className="font-semibold text-[#0F281E] whitespace-nowrap">Daerah tujuan</span>
          <select value={value.daerah || ""} onChange={(e) => onChange({ ...value, daerah: e.target.value })} data-testid="ecom-daerah-select" className={sel}>
            <option value="">-- Pilih daerah --</option>
            {shipping.rates.map((r) => <option key={r.daerah} value={r.daerah}>{`${r.daerah} (${rupiah(r.tarif_per_kg)}/kg)`}</option>)}
          </select>
        </div>
      )}
      <div className="flex justify-between text-muted-foreground"><span>Berat total{est.tier ? ` · tier ${est.tier}` : ""}</span><span className="font-mono" data-testid="ecom-berat-total">{berat} kg</span></div>
      <div className="flex justify-between text-muted-foreground">
        <span>Ongkir {manual ? "(manual)" : "(estimasi)"}</span>
        <span className="font-mono" data-testid="ecom-ongkir-est">-{rupiah(effOngkir)}</span>
      </div>
      {est.na && <p className="text-red-600" data-testid="ecom-ongkir-na">Layanan tidak tersedia untuk rute & berat ini.</p>}
      {!est.table && shipping.rates.length === 0 && <p className="text-amber-700">Atur tarif ongkir per daerah di Pengaturan.</p>}
      <p className="text-amber-700">Ongkir final ditentukan platform saat dana cair, perbarui di tabel di bawah.</p>
    </div>
  );
}
