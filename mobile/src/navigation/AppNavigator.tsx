import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { ActivityIndicator, View, Text, StyleSheet } from 'react-native';
import { useAuth } from '../context/AuthContext';
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import DashboardScreen from '../screens/DashboardScreen';
import ConnectAccountsScreen from '../screens/ConnectAccountsScreen';
import SpendingCheckupScreen from '../screens/SpendingCheckupScreen';
import PersonalityScreen from '../screens/PersonalityScreen';
import LeaksScreen from '../screens/LeaksScreen';
import AnalysisScreen from '../screens/AnalysisScreen';
import AccountTransactionsScreen from '../screens/AccountTransactionsScreen';
import SettingsScreen from '../screens/SettingsScreen';
import { colors, typography, spacing } from '../theme';

export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  MainTabs: undefined;
  ConnectAccounts: undefined;
  SpendingCheckup: undefined;
  AccountTransactions: { accountId: string; accountName: string };
  // Keep these for backward compatibility
  Dashboard: undefined;
  Personality: undefined;
  Leaks: undefined;
  Analysis: undefined;
};

export type TabParamList = {
  Home: undefined;
  Analysis: undefined;
  Leaks: undefined;
  Settings: undefined;
};

const Stack = createStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

// Simple icon component
const TabIcon = ({ name, focused }: { name: string; focused: boolean }) => {
  const icons: Record<string, string> = {
    Home: '⬡',
    Analysis: '◈',
    Leaks: '◎',
    Settings: '⚙',
  };

  return (
    <Text
      style={[
        styles.tabIcon,
        { color: focused ? colors.accent : colors.textTertiary },
      ]}
    >
      {icons[name] || '•'}
    </Text>
  );
};

// Bottom Tab Navigator
const MainTabs = () => {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused }) => (
          <TabIcon name={route.name} focused={focused} />
        ),
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabBarLabel,
        headerStyle: styles.header,
        headerTitleStyle: styles.headerTitle,
        headerShadowVisible: false,
      })}
    >
      <Tab.Screen
        name="Home"
        component={DashboardScreen}
        options={{
          title: 'vera',
          headerTitle: '',
        }}
      />
      <Tab.Screen
        name="Analysis"
        component={AnalysisScreen}
        options={{
          title: 'Analysis',
          headerTitle: '',
        }}
      />
      <Tab.Screen
        name="Leaks"
        component={LeaksScreen}
        options={{
          title: 'Leaks',
          headerTitle: '',
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          title: 'Settings',
          headerTitle: '',
        }}
      />
    </Tab.Navigator>
  );
};

const AppNavigator = () => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerStyle: styles.header,
          headerTitleStyle: styles.headerTitle,
          headerTintColor: colors.textPrimary,
          headerShadowVisible: false,
          headerBackTitleVisible: false,
        }}
      >
        {!isAuthenticated ? (
          // Auth Screens
          <>
            <Stack.Screen
              name="Login"
              component={LoginScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="Register"
              component={RegisterScreen}
              options={{ headerShown: false }}
            />
          </>
        ) : (
          // Main App Screens
          <>
            <Stack.Screen
              name="MainTabs"
              component={MainTabs}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="ConnectAccounts"
              component={ConnectAccountsScreen}
              options={{ title: 'Connect Account' }}
            />
            <Stack.Screen
              name="SpendingCheckup"
              component={SpendingCheckupScreen}
              options={{ title: 'Weekly Checkup' }}
            />
            <Stack.Screen
              name="AccountTransactions"
              component={AccountTransactionsScreen}
              options={{ title: 'Transactions' }}
            />
            {/* Keep these for backward compatibility with navigation.navigate calls */}
            <Stack.Screen
              name="Personality"
              component={PersonalityScreen}
              options={{ title: 'Spending Personality' }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  header: {
    backgroundColor: colors.background,
    elevation: 0,
    shadowOpacity: 0,
    borderBottomWidth: 0,
  },
  headerTitle: {
    fontSize: typography.headline,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
  },
  tabBar: {
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    height: 80,
  },
  tabBarLabel: {
    fontSize: typography.caption,
    fontWeight: typography.weights.medium,
  },
  tabIcon: {
    fontSize: 24,
    marginBottom: 2,
  },
});

export default AppNavigator;
