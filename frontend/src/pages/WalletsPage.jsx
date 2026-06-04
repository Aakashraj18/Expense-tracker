import { useState, useEffect } from 'react';
import { useWallets } from '../context/WalletContext';
import api from '../lib/api';
import { Wallet, Plus, Users, X } from 'lucide-react';
import { cn } from '../lib/utils';

function CreateWalletModal({ onClose, onCreate }) {
  const [form, setForm] = useState({ name: '', type: 'personal', currency: 'USD', monthlyBudget: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name) return setError('Name is required');
    setLoading(true);
    try {
      const body = { ...form, monthlyBudget: form.monthlyBudget ? parseFloat(form.monthlyBudget) : 0 };
      await onCreate(body);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create wallet');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}
        style={{ animation: 'slideUp 0.3s ease-out' }}>
        <button onClick={onClose} className="absolute right-4 top-4 rounded-lg p-1.5 text-muted-foreground hover:bg-secondary">
          <X className="h-4 w-4" />
        </button>
        <h2 className="mb-5 text-lg font-bold text-foreground">Create Wallet</h2>
        {error && <div className="mb-4 rounded-lg bg-danger/10 px-4 py-2 text-xs text-danger">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Name</label>
            <input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Type</label>
              <select value={form.type} onChange={(e) => setForm(f => ({ ...f, type: e.target.value }))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary">
                <option value="personal">Personal</option>
                <option value="shared">Shared</option>
                <option value="business">Business</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Currency</label>
              <select value={form.currency} onChange={(e) => setForm(f => ({ ...f, currency: e.target.value }))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary">
                {['USD', 'EUR', 'GBP', 'INR', 'JPY', 'CAD', 'AUD'].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Monthly Budget</label>
            <input type="number" value={form.monthlyBudget} onChange={(e) => setForm(f => ({ ...f, monthlyBudget: e.target.value }))}
              placeholder="0 = no budget" className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary" />
          </div>
          <button type="submit" disabled={loading}
            className="w-full rounded-lg bg-gradient-to-r from-primary to-accent py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
            {loading ? 'Creating...' : 'Create Wallet'}
          </button>
        </form>
        <style>{`@keyframes slideUp { from { opacity:0; transform:translateY(20px) scale(.97) } to { opacity:1; transform:translateY(0) scale(1) } }`}</style>
      </div>
    </div>
  );
}

export default function WalletsPage() {
  const { wallets, activeWallet, selectWallet, fetchWallets, createWallet } = useWallets();
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => { fetchWallets(); }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Wallets</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{wallets.length} wallet(s)</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-primary to-accent px-4 py-2 text-xs font-semibold text-white hover:opacity-90">
          <Plus className="h-3.5 w-3.5" /> New Wallet
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {wallets.map((w) => (
          <button
            key={w.id}
            onClick={() => selectWallet(w)}
            className={cn(
              'group relative rounded-xl border p-5 text-left transition-all duration-300 hover:shadow-lg',
              activeWallet?.id === w.id
                ? 'border-primary bg-primary/5 shadow-lg shadow-primary/10'
                : 'border-border bg-card hover:border-primary/30'
            )}
          >
            <div className="flex items-start justify-between">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-accent/20">
                <Wallet className="h-5 w-5 text-primary" />
              </div>
              {activeWallet?.id === w.id && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">ACTIVE</span>
              )}
            </div>
            <div className="mt-4">
              <h3 className="text-sm font-semibold text-foreground">{w.name}</h3>
              <p className="text-xs text-muted-foreground">{w.type} · {w.currency}</p>
            </div>
            {w.monthlyBudget > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                Budget: ${Number(w.monthlyBudget).toLocaleString()}/mo
              </p>
            )}
            <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
              <Users className="h-3 w-3" />
              <span>Role: {w.myRole}</span>
            </div>
          </button>
        ))}
      </div>

      {showCreate && (
        <CreateWalletModal
          onClose={() => setShowCreate(false)}
          onCreate={async (body) => {
            await createWallet(body);
            fetchWallets();
          }}
        />
      )}
    </div>
  );
}
