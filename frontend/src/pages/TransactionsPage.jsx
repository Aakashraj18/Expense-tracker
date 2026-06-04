import { useState } from 'react';
import { useWallets } from '../context/WalletContext';
import { useTransactions } from '../hooks/useDashboard';
import TransactionList from '../components/ui/TransactionList';
import AddTransactionModal from '../components/ui/AddTransactionModal';
import { Plus, Search, Filter } from 'lucide-react';

const CATEGORIES = [
  'Salary', 'Freelance', 'Investment', 'Rent', 'Groceries', 'Dining',
  'Transportation', 'Utilities', 'Entertainment', 'Shopping', 'Healthcare',
  'Education', 'Subscriptions', 'Travel', 'Insurance', 'Other',
];

export default function TransactionsPage() {
  const { activeWallet } = useWallets();
  const walletId = activeWallet?.id;

  const [filters, setFilters] = useState({});
  const [showModal, setShowModal] = useState(false);

  const { transactions, pagination, loading, fetchTransactions, setTransactions } = useTransactions(walletId, filters);

  const handleCreated = (tx) => {
    setTransactions((prev) => [tx, ...prev]);
  };

  const updateFilter = (key, value) => {
    setFilters((prev) => {
      const next = { ...prev };
      if (value) next[key] = value;
      else delete next[key];
      return next;
    });
  };

  if (!walletId) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-sm text-muted-foreground">
        Select a wallet to view transactions
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Transactions</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {activeWallet?.name} · {pagination.total} total
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-primary to-accent px-4 py-2 text-xs font-semibold text-white transition-all hover:opacity-90"
        >
          <Plus className="h-3.5 w-3.5" /> Add Transaction
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <select
          value={filters.type || ''}
          onChange={(e) => updateFilter('type', e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground outline-none focus:border-primary"
        >
          <option value="">All Types</option>
          <option value="expense">Expense</option>
          <option value="income">Income</option>
          <option value="transfer">Transfer</option>
        </select>
        <select
          value={filters.category || ''}
          onChange={(e) => updateFilter('category', e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground outline-none focus:border-primary"
        >
          <option value="">All Categories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input
          type="date"
          value={filters.startDate || ''}
          onChange={(e) => updateFilter('startDate', e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground outline-none focus:border-primary"
          placeholder="Start date"
        />
        <input
          type="date"
          value={filters.endDate || ''}
          onChange={(e) => updateFilter('endDate', e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground outline-none focus:border-primary"
          placeholder="End date"
        />
        {Object.keys(filters).length > 0 && (
          <button
            onClick={() => setFilters({})}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Transaction List */}
      <div className="rounded-xl border border-border bg-card p-5">
        <TransactionList
          transactions={transactions}
          pagination={pagination}
          loading={loading}
          onPageChange={(p) => fetchTransactions(p)}
        />
      </div>

      {showModal && (
        <AddTransactionModal
          walletId={walletId}
          onClose={() => setShowModal(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}
