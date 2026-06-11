import { useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';
import api from '../../lib/api';
import { useWallets } from '../../context/WalletContext';

const CATEGORIES = [
  'Salary', 'Freelance', 'Investment', 'Rent', 'Mortgage',
  'Groceries', 'Dining', 'Transportation', 'Utilities',
  'Entertainment', 'Shopping', 'Healthcare', 'Education',
  'Subscriptions', 'Travel', 'Insurance', 'Gifts', 'Other',
];

export default function AddTransactionModal({ walletId, onClose, onCreated }) {
  const [form, setForm] = useState({
    type: 'expense',
    amount: '',
    category: '',
    description: '',
    merchant: '',
    date: new Date().toISOString().split('T')[0],
    isRecurring: false,
    frequency: 'monthly',
    toWalletId: '',
  });
  const { wallets } = useWallets();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.amount || !form.category) {
      setError('Amount and category are required');
      return;
    }
    if (form.type === 'transfer' && !form.toWalletId) {
      setError('Destination wallet is required for transfers');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const body = {
        type: form.type,
        amount: parseFloat(form.amount),
        category: form.category,
        description: form.description,
        merchant: form.merchant || undefined,
        date: new Date(form.date).toISOString(),
        toWalletId: form.type === 'transfer' ? form.toWalletId : undefined,
      };
      if (form.isRecurring) {
        body.recurrence = { isRecurring: true, frequency: form.frequency };
      }
      const { data } = await api.post(`/wallets/${walletId}/transactions`, body, {
        headers: { 'X-Idempotency-Key': `tx-${Date.now()}-${Math.random().toString(36).slice(2)}` },
      });
      onCreated?.(data.data.transaction);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create transaction');
    } finally {
      setLoading(false);
    }
  };

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative w-full max-w-md animate-in rounded-2xl border border-border bg-card p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: 'slideUp 0.3s ease-out' }}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        <h2 className="mb-5 text-lg font-bold text-foreground">Add Transaction</h2>

        {error && (
          <div className="mb-4 rounded-lg bg-danger/10 px-4 py-2.5 text-xs text-danger">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Type selector */}
          <div className="flex gap-2">
            {['expense', 'income', 'transfer'].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setForm((f) => ({ ...f, type: t }))}
                className={cn(
                  'flex-1 rounded-lg border py-2 text-xs font-semibold capitalize transition-all',
                  form.type === t
                    ? t === 'expense' ? 'border-danger bg-danger/10 text-danger'
                    : t === 'income' ? 'border-success bg-success/10 text-success'
                    : 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:border-secondary'
                )}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Amount */}
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Amount</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={form.amount}
                onChange={set('amount')}
                placeholder="0.00"
                className="w-full rounded-lg border border-border bg-background py-2.5 pl-7 pr-4 text-sm text-foreground outline-none transition-colors focus:border-primary"
                required
              />
            </div>
          </div>

          {/* Category */}
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Category</label>
            <select
              value={form.category}
              onChange={set('category')}
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary"
              required
            >
              <option value="">Select category...</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* To Wallet (only for transfers) */}
          {form.type === 'transfer' && (
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">To Wallet</label>
              <select
                value={form.toWalletId}
                onChange={set('toWalletId')}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary"
                required
              >
                <option value="">Select destination wallet...</option>
                {(wallets || []).filter(w => w._id !== walletId && w.id !== walletId).map((w) => (
                  <option key={w._id || w.id} value={w._id || w.id}>{w.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Description + Merchant */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Description</label>
              <input
                value={form.description}
                onChange={set('description')}
                placeholder="What for?"
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Merchant</label>
              <input
                value={form.merchant}
                onChange={set('merchant')}
                placeholder="Store name"
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary"
              />
            </div>
          </div>

          {/* Date */}
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Date</label>
            <input
              type="date"
              value={form.date}
              onChange={set('date')}
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary"
            />
          </div>

          {/* Recurring toggle */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, isRecurring: !f.isRecurring }))}
              className={cn(
                'h-5 w-9 rounded-full transition-colors',
                form.isRecurring ? 'bg-primary' : 'bg-secondary'
              )}
            >
              <div className={cn(
                'h-4 w-4 rounded-full bg-white transition-transform',
                form.isRecurring ? 'translate-x-4.5' : 'translate-x-0.5'
              )} />
            </button>
            <span className="text-xs text-muted-foreground">Recurring</span>
            {form.isRecurring && (
              <select
                value={form.frequency}
                onChange={set('frequency')}
                className="ml-auto rounded-lg border border-border bg-background px-2 py-1 text-xs text-foreground outline-none focus:border-primary"
              >
                {['daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'].map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            )}
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-gradient-to-r from-primary to-accent py-2.5 text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50"
          >
            {loading ? 'Creating...' : 'Add Transaction'}
          </button>
        </form>
      </div>

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
