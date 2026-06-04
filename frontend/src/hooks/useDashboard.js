import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';

/**
 * useDashboardData — fetches the full /reports/summary for a wallet.
 * Re-fetches when walletId changes.
 */
export function useDashboardData(walletId) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refetch = useCallback(async () => {
    if (!walletId) return;
    setLoading(true);
    try {
      const { data: res } = await api.get(`/wallets/${walletId}/reports/summary`);
      setData(res.data);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, [walletId]);

  useEffect(() => { refetch(); }, [refetch]);

  return { data, loading, error, refetch };
}

/**
 * useTransactions — paginated transaction list for a wallet.
 */
export function useTransactions(walletId, filters = {}) {
  const [transactions, setTransactions] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoading] = useState(true);

  const fetchTransactions = useCallback(async (page = 1) => {
    if (!walletId) return;
    setLoading(true);
    try {
      const params = { page, limit: 15, ...filters };
      const { data } = await api.get(`/wallets/${walletId}/transactions`, { params });
      setTransactions(data.data.transactions);
      setPagination(data.pagination);
    } catch (err) {
      console.error('Failed to fetch transactions:', err);
    } finally {
      setLoading(false);
    }
  }, [walletId, JSON.stringify(filters)]);

  useEffect(() => { fetchTransactions(1); }, [fetchTransactions]);

  return { transactions, pagination, loading, fetchTransactions, setTransactions };
}
