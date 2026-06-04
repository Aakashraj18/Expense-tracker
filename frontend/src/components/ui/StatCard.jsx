import { cn } from '../../lib/utils';

export default function StatCard({ title, value, subtitle, icon: Icon, trend, className }) {
  const isPositive = trend > 0;
  const isNegative = trend < 0;

  return (
    <div className={cn(
      'group relative overflow-hidden rounded-xl border border-border bg-card p-5 transition-all duration-300 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5',
      className
    )}>
      {/* Glow effect */}
      <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-primary/5 transition-transform duration-500 group-hover:scale-150" />

      <div className="relative flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold tracking-tight text-foreground">{value}</p>
          {subtitle && (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          )}
          {trend !== undefined && trend !== null && (
            <div className="flex items-center gap-1.5">
              <span className={cn(
                'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold',
                isPositive && 'bg-success/10 text-success',
                isNegative && 'bg-danger/10 text-danger',
                !isPositive && !isNegative && 'bg-muted/20 text-muted-foreground'
              )}>
                {isPositive ? '↑' : isNegative ? '↓' : '—'} {Math.abs(trend)}%
              </span>
              <span className="text-[10px] text-muted-foreground">vs last month</span>
            </div>
          )}
        </div>
        {Icon && (
          <div className="rounded-xl bg-primary/10 p-2.5">
            <Icon className="h-5 w-5 text-primary" />
          </div>
        )}
      </div>
    </div>
  );
}
