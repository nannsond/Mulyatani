import { rupiah, fmtDate } from "@/lib/format";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, Legend } from "recharts";

const iso = (d) => d.toISOString().slice(0, 10);

// Fill every day of the period (up to today) so the saldo line carries forward on quiet days.
const fillDays = (period, rows) => {
  const byDate = Object.fromEntries(rows.map((r) => [r.date, r]));
  const [y, m] = period.split("-").map(Number);
  const start = new Date(Date.UTC(y, m ? m - 1 : 0, 1));
  const end = new Date(Date.UTC(m ? y : y + 1, m ? m : 0, 0));
  const today = new Date(); const last = today < end ? new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())) : end;
  const out = []; let saldo = 0;
  for (let d = new Date(start); d <= last; d.setUTCDate(d.getUTCDate() + 1)) {
    const r = byDate[iso(d)];
    if (r) saldo = r.saldo_berjalan;
    out.push({ date: iso(d), saldo, masuk: r?.masuk || 0, keluar: r?.keluar || 0 });
  }
  return out;
};

const short = (v) => (Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(1)}jt` : Math.abs(v) >= 1e3 ? `${Math.round(v / 1e3)}rb` : v);

export const CashFlowChart = ({ period, rows }) => {
  const data = fillDays(period, rows);
  if (data.length === 0) return null;
  return (
    <div className="h-72 mb-6" data-testid="cash-flow-chart">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
          <XAxis dataKey="date" tickFormatter={(d) => (period.length === 7 ? d.slice(8) : fmtDate(d).slice(3))} tick={{ fontSize: 11 }} minTickGap={16} />
          <YAxis tickFormatter={short} tick={{ fontSize: 11 }} width={52} />
          <Tooltip formatter={(v, n) => [rupiah(v), n]} labelFormatter={(d) => fmtDate(d)} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <ReferenceLine y={0} stroke="#94A3B8" />
          <Line type="monotone" dataKey="masuk" name="Uang Masuk" stroke="#38BDF8" strokeWidth={1.5} dot={false} />
          <Line type="monotone" dataKey="keluar" name="Uang Keluar" stroke="#F87171" strokeWidth={1.5} dot={false} />
          <Line type="stepAfter" dataKey="saldo" name="Saldo Berjalan" stroke="#1B5E3B" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
