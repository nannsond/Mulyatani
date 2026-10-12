import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { rupiah } from "@/lib/format";
import { LoanForm } from "@/components/LoanForm";
import { LoanCard } from "@/components/LoanCard";

const Stat = ({ label, value, tid, cls = "" }) => (
  <div className="bg-card rounded-2xl border border-slate-200 p-5">
    <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
    <p data-testid={tid} className={`mt-2 text-2xl font-mono font-bold ${cls}`}>{value}</p>
  </div>
);

export default function PinjamanModal() {
  const [loans, setLoans] = useState([]);
  const load = () => api.get("/loans").then((r) => setLoans(r.data));
  useEffect(() => { load(); }, []);

  const active = loans.filter((l) => l.status === "Aktif");
  const sum = (arr, k) => arr.reduce((s, x) => s + x[k], 0);

  return (
    <div className="space-y-6">
      <div className="grid sm:grid-cols-3 gap-4">
        <Stat label="Total Pokok Pinjaman Aktif" value={rupiah(sum(active, "principal"))} tid="loan-stat-principal" />
        <Stat label="Sudah Dibayar" value={rupiah(sum(loans, "paid"))} tid="loan-stat-paid" cls="text-[#1B5E3B]" />
        <Stat label="Sisa Hutang" value={rupiah(sum(active, "remaining"))} tid="loan-stat-remaining" cls="text-destructive" />
      </div>
      <div className="grid lg:grid-cols-3 gap-6">
        <LoanForm onSaved={load} />
        <div className="lg:col-span-2 space-y-4" data-testid="loan-list">
          {loans.length === 0 && (
            <div className="bg-card rounded-2xl border border-slate-200 p-10 text-center text-muted-foreground">Belum ada pinjaman modal.</div>
          )}
          {loans.map((l) => <LoanCard key={l.id} loan={l} onChange={load} />)}
        </div>
      </div>
    </div>
  );
}
