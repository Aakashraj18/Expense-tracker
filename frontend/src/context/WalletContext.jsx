import { createContext, useContext, useState, useCallback } from 'react';
import api from '../lib/api';

const WalletContext = createContext(null);

export function WalletProvider({ children }) {
  const [wallets, setWallets] = useState([]);
  const [activeWallet, setActiveWallet] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchWallets = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/wallets');
      setWallets(data.data.wallets);
      // Auto-select first wallet if none selected
      if (!activeWallet && data.data.wallets.length > 0) {
        setActiveWallet(data.data.wallets[0]);
      }
    } catch (err) {
      console.error('Failed to fetch wallets:', err);
    } finally {
      setLoading(false);
    }
  }, [activeWallet]);

  const createWallet = useCallback(async (fields) => {
    const { data } = await api.post('/wallets', fields);
    setWallets((prev) => [data.data.wallet, ...prev]);
    return data.data.wallet;
  }, []);

  const selectWallet = useCallback((wallet) => {
    setActiveWallet(wallet);
  }, []);

  return (
    <WalletContext.Provider value={{
      wallets, activeWallet, loading,
      fetchWallets, createWallet, selectWallet,
    }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallets() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallets must be used inside <WalletProvider>');
  return ctx;
}
