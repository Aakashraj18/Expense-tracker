import { ArrowUpRight, ArrowDownLeft, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';

const typeConfig = {
  income:   { icon: ArrowDownLeft, color: 'text-success', bg: 'bg-success/10', label: '+' },
  expense:  { icon: ArrowUpRight, color: 'text-danger',  bg: 'bg-danger/10',  label: '-' },
  transfer: { icon: RefreshCw,    color: 'text-primary', bg: 'bg-primary/10', label: '↔' },
};

function TransactionRow({ tx }) {
  const cfg = typeConfig[tx.type] || typeConfig.expense;
  const Icon = cfg.icon;
  const date = new Date(tx.date).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });

  return (
    <div className="group flex items-center gap-4 rounded-lg px-4 py-3 transition-colors hover:bg-secondary/50">
      <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', cfg.bg)}>
        <Icon className={cn('h-4.5 w-4.5', cfg.color)} />
      </div>
      <div className="flex-1 overflow-hidden">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-foreground">
            {tx.description || tx.category}
          </p>
          {tx.recurrence?.isRecurring && (
            <span className="rounded-full bg-accent/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-accent">
              recurring
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {tx.category}{tx.merchant ? ` · ${tx.merchant}` : ''} · {date}
        </p>
      </div>
      <div className="text-right">
        <p className={cn('text-sm font-semibold', cfg.color)}>
          {cfg.label}${Number(tx.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </p>
        <p className="text-[10px] uppercase text-muted-foreground">{tx.currency}</p>
      </div>
    </div>
  );
}

export default function TransactionList({ transactions, pagination, onPageChange, loading }) {
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 rounded-lg px-4 py-3">
            <div className="h-10 w-10 animate-pulse rounded-xl bg-secondary" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-40 animate-pulse rounded bg-secondary" />
              <div className="h-3 w-28 animate-pulse rounded bg-secondary" />
            </div>
            <div className="h-4 w-16 animate-pulse rounded bg-secondary" />
          </div>
        ))}
      </div>
    );
  }

  if (!transactions.length) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
        No transactions yet. Add your first expense!
      </div>
    );
  }

  return (
    <div>
      <div className="divide-y divide-border">
        {transactions.map((tx) => (
          <TransactionRow key={tx.id || tx._id} tx={tx} />
        ))}
      </div>

      {/* Pagination */}
      {pagination && pagination.pages > 1 && (
        <div className="mt-4 flex items-center justify-between border-t border-border px-4 pt-4">
          <p className="text-xs text-muted-foreground">
            Page {pagination.page} of {pagination.pages} · {pagination.total} total
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => onPageChange?.(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-secondary disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => onPageChange?.(pagination.page + 1)}
              disabled={pagination.page >= pagination.pages}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-secondary disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
