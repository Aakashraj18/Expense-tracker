import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount, currency, includeDecimals = true) {
  const safeCurrency = currency || 'INR';
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: safeCurrency,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: includeDecimals ? 2 : 0,
      maximumFractionDigits: includeDecimals ? 2 : 0,
    }).format(amount || 0);
  } catch (err) {
    return `${safeCurrency} ${amount || 0}`;
  }
}
