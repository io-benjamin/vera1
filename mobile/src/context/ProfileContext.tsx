import React, { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { Account, MonthlySpending } from '../types';
import { getToken, syncTransactions } from '../services/api';
import { useAuth } from './AuthContext';

interface AppContextType {
  accounts: Account[];
  monthlySpending: MonthlySpending | null;
  setAccounts: (accounts: Account[]) => void;
  addAccount: (account: Account) => void;
  setMonthlySpending: (spending: MonthlySpending) => void;
  refreshAccounts: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [accounts, setAccountsState] = useState<Account[]>([]);
  const [monthlySpending, setMonthlySpendingState] = useState<MonthlySpending | null>(null);

  const setAccounts = (accountsList: Account[]) => {
    setAccountsState(accountsList);
  };

  const addAccount = (account: Account) => {
    setAccountsState((prev) => [...prev, account]);
  };

  const setMonthlySpending = (spending: MonthlySpending) => {
    setMonthlySpendingState(spending);
  };

  const refreshAccounts = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return; // Not logged in

      const response = await fetch('http://127.0.0.1:3000/api/accounts', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.accounts && data.accounts.length > 0) {
          setAccountsState(data.accounts.map((acc: any) => ({
            id: acc.id,
            name: acc.name,
            type: acc.type,
            institution_name: acc.institution_name,
            balance: acc.balance,
            is_active: acc.is_active,
          })));
        }
      }
    } catch (error) {
      console.error('Error refreshing accounts:', error);
    }
  }, []);

  // Re-fetch accounts whenever the user logs in or out
  useEffect(() => {
    if (isAuthenticated) {
      refreshAccounts();
    } else {
      setAccountsState([]);
    }
  }, [isAuthenticated, refreshAccounts]);

  // Silent background sync whenever the app comes to the foreground
  const appState = useRef(AppState.currentState);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (next: AppStateStatus) => {
      const wasBackground = appState.current.match(/inactive|background/);
      const isForeground = next === 'active';
      appState.current = next;

      if (wasBackground && isForeground) {
        try {
          await syncTransactions();
          await refreshAccounts();
        } catch {
          // Silent — don't surface sync errors to the user
        }
      }
    });
    return () => subscription.remove();
  }, [refreshAccounts]);

  return (
    <AppContext.Provider
      value={{
        accounts,
        monthlySpending,
        setAccounts,
        addAccount,
        setMonthlySpending,
        refreshAccounts,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
