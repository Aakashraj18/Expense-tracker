import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { formatCurrency } from '../../lib/utils';

const COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f59e0b',
  '#10b981', '#06b6d4', '#f97316', '#ef4444',
  '#84cc16', '#14b8a6',
];

const CustomTooltip = ({ active, payload, currency = 'INR' }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3 shadow-xl">
      <p className="text-sm font-semibold text-foreground">{d.category}</p>
      <p className="text-xs text-muted-foreground">
        {formatCurrency(d.total, currency, false)} · {d.percentage}%
      </p>
      <p className="text-[11px] text-muted-foreground">{d.count} transactions</p>
    </div>
  );
};

export default function CategoryPieChart({ data = [], currency = 'INR' }) {
  if (!data.length) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        No spending data yet
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="mb-4 text-sm font-semibold text-foreground">Spending by Category</h3>
      <div className="flex items-center gap-6">
        <ResponsiveContainer width="50%" height={220}>
          <PieChart>
            <Pie
              data={data}
              dataKey="total"
              nameKey="category"
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={85}
              paddingAngle={3}
              strokeWidth={0}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip currency={currency} />} />
          </PieChart>
        </ResponsiveContainer>

        {/* Legend */}
        <div className="flex-1 space-y-2">
          {data.slice(0, 6).map((cat, i) => (
            <div key={cat.category} className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: COLORS[i % COLORS.length] }}
                />
                <span className="text-xs text-muted-foreground">{cat.category}</span>
              </div>
              <span className="text-xs font-semibold text-foreground">
                {formatCurrency(cat.total, currency, false)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
