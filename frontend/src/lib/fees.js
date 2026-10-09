export function calcFees(fees = [], omzet = 0) {
  const items = fees.map((f) => {
    let amount = f.type === "percent" ? (omzet * (Number(f.value) || 0)) / 100 : Number(f.value) || 0;
    if (Number(f.cap) > 0) amount = Math.min(amount, Number(f.cap));
    return { label: f.label, amount: omzet > 0 ? Math.round(amount) : 0 };
  });
  return { items, total: items.reduce((s, i) => s + i.amount, 0) };
}

export const feeText = (f) => (f.type === "percent" ? `${f.value}%` : `Rp ${Number(f.value).toLocaleString("id-ID")}`) + (Number(f.cap) > 0 ? ` (maks Rp ${Number(f.cap).toLocaleString("id-ID")})` : "");

// Harga jual minimal agar (harga - potongan - modal) >= target untung, dibulatkan ke atas per Rp100.
export function suggestPrice(fees = [], cost = 0, target = 0) {
  const need = (Number(cost) || 0) + (Number(target) || 0);
  if (need <= 0) return 0;
  let capped = new Set();
  let price = 0;
  for (let k = 0; k < 10; k++) {
    let pct = 0, fixed = 0;
    fees.forEach((f, i) => {
      if (f.type === "percent" && !capped.has(i)) pct += (Number(f.value) || 0) / 100;
      else fixed += f.type === "percent" ? Number(f.cap) : Number(f.value) || 0;
    });
    price = pct < 1 ? (need + fixed) / (1 - pct) : 0;
    const next = new Set(fees.map((f, i) => (f.type === "percent" && Number(f.cap) > 0 && (price * f.value) / 100 > f.cap ? i : -1)).filter((i) => i >= 0));
    if (next.size === capped.size) break;
    capped = next;
  }
  let rounded = Math.ceil(price / 100) * 100;
  while (rounded - calcFees(fees, rounded).total < need) rounded += 100;
  return rounded;
}

export const targetProfit = (cost, mode, value) => (mode === "percent" ? Math.round(((Number(cost) || 0) * (Number(value) || 0)) / 100) : Number(value) || 0);
