import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Account, SpendingCheckup, MonthlySpending } from '../types';
import { getToken } from '../services/api';

interface AppContextType {
  accounts: Account[];
  currentCheckup: SpendingCheckup | null;
  monthlySpending: MonthlySpending | null;
  setAccounts: (accounts: Account[]) => void;
  addAccount: (account: Account) => void;
  setCurrentCheckup: (checkup: SpendingCheckup) => void;
  setMonthlySpending: (spending: MonthlySpending) => void;
  refreshAccounts: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [accounts, setAccountsState] = useState<Account[]>([]);
  const [currentCheckup, setCurrentCheckupState] = useState<SpendingCheckup | null>(null);
  const [monthlySpending, setMonthlySpendingState] = useState<MonthlySpending | null>(null);

  const setAccounts = (accountsList: Account[]) => {
    setAccountsState(accountsList);
  };

  const addAccount = (account: Account) => {
    setAccountsState((prev) => [...prev, account]);
  };

  const setCurrentCheckup = (checkup: SpendingCheckup) => {
    setCurrentCheckupState(checkup);
  };

  const setMonthlySpending = (spending: MonthlySpending) => {
    setMonthlySpendingState(spending);
  };

  const refreshAccounts = async () => {
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
  };

  // Load accounts on mount
  useEffect(() => {
    refreshAccounts();
  }, []);

  return (
    <AppContext.Provider
      value={{
        accounts,
        currentCheckup,
        monthlySpending,
        setAccounts,
        addAccount,
        setCurrentCheckup,
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
