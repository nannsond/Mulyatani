export function calcFees(fees = [], omzet = 0) {
  const items = fees.map((f) => {
    let amount = f.type === "percent" ? (omzet * (Number(f.value) || 0)) / 100 : Number(f.value) || 0;
    if (Number(f.cap) > 0) amount = Math.min(amount, Number(f.cap));
    return { label: f.label, amount: omzet > 0 ? Math.round(amount) : 0 };
  });
  return { items, total: items.reduce((s, i) => s + i.amount, 0) };
}

export const feeText = (f) => (f.type === "percent" ? `${f.value}%` : `Rp ${Number(f.value).toLocaleString("id-ID")}`) + (Number(f.cap) > 0 ? ` (maks Rp ${Number(f.cap).toLocaleString("id-ID")})` : "");
