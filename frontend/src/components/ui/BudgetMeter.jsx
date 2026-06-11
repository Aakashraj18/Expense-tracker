import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { cn, formatCurrency } from '../../lib/utils';

export default function BudgetMeter({ budget, currency = 'INR' }) {
  if (!budget || !budget.budget) {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground">Budget Status</h3>
        <p className="mt-3 text-xs text-muted-foreground">No budget set for this wallet</p>
      </div>
    );
  }

  const pct = Math.min(budget.percentageUsed || 0, 100);
  const isOver = budget.isOverBudget;

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Monthly Budget</h3>
        <span className={cn(
          'rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
          isOver ? 'bg-danger/10 text-danger' : 'bg-success/10 text-success'
        )}>
          {isOver ? 'Over Budget' : 'On Track'}
        </span>
      </div>

      {/* Progress bar */}
      <div className="mb-3 h-3 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-700 ease-out',
            isOver
              ? 'bg-gradient-to-r from-danger to-danger/70'
              : pct > 75
                ? 'bg-gradient-to-r from-warning to-warning/70'
                : 'bg-gradient-to-r from-primary to-accent'
          )}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>

      {/* Numbers */}
      <div className="flex items-center justify-between text-xs">
        <div>
          <p className="text-[10px] text-muted-foreground uppercase">Spent</p>
          <p className="text-sm font-semibold text-foreground">
            {formatCurrency(budget.spent, currency)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-muted-foreground uppercase">Budget</p>
          <p className="text-sm font-semibold text-foreground">
            {formatCurrency(budget.budget, currency)}
          </p>
        </div>
      </div>

      {budget.remaining !== null && !isOver && (
        <p className={cn("mt-4 text-xs font-medium", status.color)}>
          {formatCurrency(budget.remaining, currency)} remaining
        </p>
      )}
      {isOver && (
        <p className={cn("mt-4 text-xs font-medium", status.color)}>
          {formatCurrency(Math.abs(budget.remaining), currency)} over budget
        </p>
      )}
    </div>
  );
}
