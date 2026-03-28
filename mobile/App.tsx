import React from 'react';
import { AppProvider } from './src/context/ProfileContext';
import { AuthProvider } from './src/context/AuthContext';
import AppNavigator from './src/navigation/AppNavigator';

export default function App() {
  return (
    <AuthProvider>
      <AppProvider>
        <AppNavigator />
      </AppProvider>
    </AuthProvider>
  );
}
