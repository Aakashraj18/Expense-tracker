import { useState, useEffect, useCallback } from 'react';
import { useWallets } from '../context/WalletContext';
import api from '../lib/api';
import { formatCurrency } from '../lib/utils';
import BurnRateChart from '../components/ui/BurnRateChart';
import CategoryPieChart from '../components/ui/CategoryPieChart';
import BudgetMeter from '../components/ui/BudgetMeter';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

function MerchantBar({ data = [], activeWallet }) {
  if (!data.length) {
    return <p className="text-sm text-muted-foreground">No merchant data</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart data={data} layout="vertical" margin={{ left: 80, right: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2e3440" horizontal={false} />
        <XAxis
          type="number"
          tick={{ fill: '#9ca3af', fontSize: 11 }}
          tickFormatter={(v) => {
            if (v >= 1000) return `${formatCurrency(v / 1000, activeWallet?.currency, false)}k`;
            return formatCurrency(v, activeWallet?.currency, false);
          }}
          axisLine={false}
        />
        <YAxis
          type="category"
          dataKey="merchant"
          tick={{ fill: '#9ca3af', fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={80}
        />
        <Tooltip
          cursor={{ fill: 'rgba(99, 102, 241, 0.1)' }}
          contentStyle={{
            backgroundColor: '#1e212b', border: '1px solid #2e3440',
            borderRadius: '8px', fontSize: '12px', color: '#f8fafc',
          }}
          formatter={(v) => [formatCurrency(v, activeWallet?.currency), 'Spent']}
        />
        <Bar dataKey="total" fill="url(#barGradient)" radius={[0, 6, 6, 0]} barSize={20}>
          <defs>
            <linearGradient id="barGradient" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#6366f1" />
              <stop offset="100%" stopColor="#8b5cf6" />
            </linearGradient>
          </defs>
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export default function AnalyticsPage() {
  const { activeWallet } = useWallets();
  const walletId = activeWallet?.id;
  const [months, setMonths] = useState(6);
  const [data, setData] = useState({ trend: [], categories: [], budget: null, merchants: [] });
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!walletId) return;
    setLoading(true);
    try {
      const [trendRes, catRes, budgetRes, merchRes] = await Promise.all([
        api.get(`/wallets/${walletId}/reports/trend?months=${months}`),
        api.get(`/wallets/${walletId}/reports/categories`),
        api.get(`/wallets/${walletId}/reports/budget`),
        api.get(`/wallets/${walletId}/reports/merchants?limit=8`),
      ]);
      setData({
        trend: trendRes.data.data.trend,
        categories: catRes.data.data.categories,
        budget: budgetRes.data.data.budget,
        merchants: merchRes.data.data.merchants,
      });
    } catch (err) {
      console.error('Failed to load analytics:', err);
    } finally {
      setLoading(false);
    }
  }, [walletId, months]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  if (!walletId) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-sm text-muted-foreground">
        Select a wallet to view analytics
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Analytics</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {activeWallet?.name} · Deep financial insights
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Trend period:</span>
          {[3, 6, 12].map((m) => (
            <button
              key={m}
              onClick={() => setMonths(m)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                months === m
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:border-secondary'
              }`}
            >
              {m}mo
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid gap-6 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-72 animate-pulse rounded-xl border border-border bg-card" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <BurnRateChart data={data.trend} currency={activeWallet?.currency} />
            <CategoryPieChart data={data.categories} currency={activeWallet?.currency} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="mb-4 text-sm font-semibold text-foreground">Top Merchants</h3>
              <MerchantBar data={data.merchants} activeWallet={activeWallet} />
            </div>
            <BudgetMeter budget={data.budget} currency={activeWallet?.currency} />
          </div>
        </>
      )}
    </div>
  );
}
