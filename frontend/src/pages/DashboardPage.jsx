import { useState, useEffect } from 'react';
import { useWallets } from '../context/WalletContext';
import { useDashboardData, useTransactions } from '../hooks/useDashboard';
import { formatCurrency } from '../lib/utils';
import StatCard from '../components/ui/StatCard';
import BurnRateChart from '../components/ui/BurnRateChart';
import CategoryPieChart from '../components/ui/CategoryPieChart';
import BudgetMeter from '../components/ui/BudgetMeter';
import TransactionList from '../components/ui/TransactionList';
import AddTransactionModal from '../components/ui/AddTransactionModal';
import {
  DollarSign, TrendingUp, TrendingDown, CreditCard, Plus, RefreshCw,
} from 'lucide-react';

export default function DashboardPage() {
  const { activeWallet, fetchWallets } = useWallets();
  const walletId = activeWallet?.id;

  const { data: summary, loading: summaryLoading, refetch: refetchSummary } = useDashboardData(walletId);
  const { transactions, pagination, loading: txLoading, fetchTransactions } = useTransactions(walletId);

  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => { fetchWallets(); }, []);

  const handleTransactionCreated = () => {
    refetchSummary();
    fetchTransactions(1);
  };

  const balance = summary?.balance || {};
  const fmt = (n) => formatCurrency(n, activeWallet?.currency);

  if (!walletId) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-semibold text-foreground">No wallet found</p>
          <p className="mt-1 text-sm text-muted-foreground">Create a wallet to get started</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Dashboard</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {activeWallet?.name} · Financial overview
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => { refetchSummary(); fetchTransactions(1); }}
            className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-primary to-accent px-4 py-2 text-xs font-semibold text-white transition-all hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" /> Add Transaction
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      {summaryLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-xl border border-border bg-card" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Net Balance"
            value={fmt(balance.netBalance)}
            icon={DollarSign}
            subtitle={`${balance.transactionCount || 0} transactions`}
          />
          <StatCard
            title="Total Income"
            value={fmt(balance.totalIncome)}
            icon={TrendingUp}
          />
          <StatCard
            title="Total Expenses"
            value={fmt(balance.totalExpenses)}
            icon={TrendingDown}
          />
          <StatCard
            title="Transactions"
            value={balance.transactionCount || 0}
            icon={CreditCard}
          />
        </div>
      )}

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <BurnRateChart data={summary?.trend || []} currency={activeWallet?.currency} />
        </div>
        <div>
          <CategoryPieChart data={summary?.categories || []} currency={activeWallet?.currency} />
        </div>
      </div>

      {/* Budget + Transactions */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div>
          <BudgetMeter budget={summary?.budget} currency={activeWallet?.currency} />
        </div>
        <div className="lg:col-span-2">
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="mb-4 text-sm font-semibold text-foreground">Recent Transactions</h3>
            <TransactionList
              transactions={transactions}
              pagination={pagination}
              loading={txLoading}
              onPageChange={(p) => fetchTransactions(p)}
              currency={activeWallet?.currency}
            />
          </div>
        </div>
      </div>

      {/* Modal */}
      {showAddModal && (
        <AddTransactionModal
          walletId={walletId}
          onClose={() => setShowAddModal(false)}
          onCreated={handleTransactionCreated}
        />
      )}
    </div>
  );
}
