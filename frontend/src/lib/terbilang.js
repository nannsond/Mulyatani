const SATUAN = ["", "Satu", "Dua", "Tiga", "Empat", "Lima", "Enam", "Tujuh", "Delapan", "Sembilan", "Sepuluh", "Sebelas"];

const baca = (n) => {
  if (n < 12) return SATUAN[n];
  if (n < 20) return `${baca(n - 10)} Belas`;
  if (n < 100) return `${baca(Math.floor(n / 10))} Puluh ${baca(n % 10)}`;
  if (n < 200) return `Seratus ${baca(n - 100)}`;
  if (n < 1000) return `${baca(Math.floor(n / 100))} Ratus ${baca(n % 100)}`;
  if (n < 2000) return `Seribu ${baca(n - 1000)}`;
  if (n < 1e6) return `${baca(Math.floor(n / 1000))} Ribu ${baca(n % 1000)}`;
  if (n < 1e9) return `${baca(Math.floor(n / 1e6))} Juta ${baca(n % 1e6)}`;
  if (n < 1e12) return `${baca(Math.floor(n / 1e9))} Miliar ${baca(n % 1e9)}`;
  return `${baca(Math.floor(n / 1e12))} Triliun ${baca(n % 1e12)}`;
};

export const terbilang = (n) => {
  const v = Math.round(Math.abs(n || 0));
  const text = v === 0 ? "Nol" : baca(v).replace(/\s+/g, " ").trim();
  return `${n < 0 ? "Minus " : ""}${text} Rupiah`;
};
