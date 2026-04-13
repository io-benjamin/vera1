import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { ActivityIndicator, View, Text, StyleSheet } from 'react-native';
import Svg, { Rect, Line, Circle, Path } from 'react-native-svg';
import { useAuth } from '../context/AuthContext';
import AuthScreen from '../screens/AuthScreen';
import HomeScreen from '../screens/HomeScreen';
import TimelineScreen from '../screens/TimelineScreen';
import ReflectionScreen from '../screens/ReflectionScreen';
import ConnectAccountsScreen from '../screens/ConnectAccountsScreen';
import PersonalityScreen from '../screens/PersonalityScreen';
import AnalysisScreen from '../screens/AnalysisScreen';
import AccountTransactionsScreen from '../screens/AccountTransactionsScreen';
import ProfileScreen from '../screens/ProfileScreen';
import PatternDetailScreen from '../screens/PatternDetailScreen';
import { colors, typography, spacing } from '../theme';

export type RootStackParamList = {
  Auth: undefined;
  MainTabs: undefined;
  ConnectAccounts: undefined;
  AccountTransactions: { accountId: string; accountName: string };
  Profile: undefined;
  Personality: undefined;
  PatternDetail: { habitId: string };
};

export type TabParamList = {
  Home: undefined;
  Analysis: { habitId?: string } | undefined;
  Timeline: undefined;
  Reflection: undefined;
};

const Stack = createStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

// House icon for Home tab
const HomeIcon = ({ color }: { color: string }) => (
  <Svg width={26} height={24} viewBox="0 0 26 24" fill="none">
    {/* Roof */}
    <Path
      d="M1.5 11 Q1.5 9.5 2.8 8.4 L11.5 1.5 Q12.3 0.9 13 0.9 Q13.7 0.9 14.5 1.5 L23.2 8.4 Q24.5 9.5 24.5 11 L24.5 12.5 Q24.5 13.8 23.2 13.8 L22 13.8 L22 20.5 Q22 22.5 20 22.5 L16.5 22.5 L16.5 17 Q16.5 15.2 15 15.2 L11 15.2 Q9.5 15.2 9.5 17 L9.5 22.5 L6 22.5 Q4 22.5 4 20.5 L4 13.8 L2.8 13.8 Q1.5 13.8 1.5 12.5 Z"
      stroke={color} strokeWidth="1.7" fill="none" strokeLinejoin="round"
    />
  </Svg>
);

// Credit card + target icon for Analysis tab
const AnalysisIcon = ({ color }: { color: string }) => (
  <Svg width={26} height={22} viewBox="0 0 26 22" fill="none">
    {/* Card body */}
    <Rect x="1" y="1" width="16" height="11" rx="2" stroke={color} strokeWidth="1.6" />
    {/* Stripe */}
    <Rect x="1" y="4" width="16" height="2.5" fill={color} opacity="0.35" />
    {/* Lines on card */}
    <Line x1="3.5" y1="9" x2="7.5" y2="9" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
    <Line x1="3.5" y1="10.8" x2="6" y2="10.8" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
    {/* Target outer ring */}
    <Circle cx="19.5" cy="15.5" r="5.8" stroke={color} strokeWidth="1.6" />
    {/* Target middle ring */}
    <Circle cx="19.5" cy="15.5" r="3.2" stroke={color} strokeWidth="1.4" />
    {/* Target bullseye */}
    <Circle cx="19.5" cy="15.5" r="1.1" fill={color} />
    {/* Arrow shaft */}
    <Line x1="23.2" y1="11.8" x2="21" y2="14" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
    {/* Arrow head */}
    <Path d="M23.2 11.8 L24.6 11 L23.8 12.4" stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

// Winding path + clock icon for Timeline tab
const TimelineIcon = ({ color }: { color: string }) => (
  <Svg width={24} height={26} viewBox="0 0 24 26" fill="none">
    {/* Top node */}
    <Circle cx="3" cy="3" r="2.2" stroke={color} strokeWidth="1.5" />
    {/* Top horizontal segment */}
    <Line x1="5.2" y1="3" x2="11" y2="3" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    {/* Middle node */}
    <Circle cx="13.2" cy="3" r="2.2" stroke={color} strokeWidth="1.5" />
    {/* Curve top-right down */}
    <Path d="M15.4 3 Q19 3 19 7" stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" />
    {/* Middle-left node */}
    <Circle cx="5" cy="11" r="2.2" stroke={color} strokeWidth="1.5" />
    {/* Curve bottom-left from right */}
    <Path d="M19 7 Q19 11 15.2 11" stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" />
    {/* Middle segment */}
    <Line x1="7.2" y1="11" x2="13" y2="11" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    {/* Curve down-left to clock row */}
    <Path d="M5 13.2 Q5 17 8 17" stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" />
    {/* Clock face */}
    <Circle cx="18" cy="20" r="5.5" stroke={color} strokeWidth="1.5" />
    {/* Clock hands */}
    <Line x1="18" y1="20" x2="18" y2="16.8" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
    <Line x1="18" y1="20" x2="20.6" y2="21.5" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
    {/* Tick marks */}
    <Line x1="18" y1="14.6" x2="18" y2="15.4" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
    <Line x1="18" y1="24.6" x2="18" y2="25.4" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
    <Line x1="12.6" y1="20" x2="13.4" y2="20" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
    <Line x1="22.6" y1="20" x2="23.4" y2="20" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
  </Svg>
);

// Person + mirror icon for Reflect tab
const ReflectIcon = ({ color }: { color: string }) => (
  <Svg width={26} height={24} viewBox="0 0 26 24" fill="none">
    {/* Mirror frame (rounded rect) */}
    <Path
      d="M13 2 H22 Q25 2 25 5 V18 Q25 21 22 21 H13 Q10 21 10 18 V5 Q10 2 13 2 Z"
      stroke={color} strokeWidth="1.6" fill="none"
    />
    {/* Mirror glare lines */}
    <Line x1="20" y1="4.5" x2="23" y2="7.5" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
    <Line x1="21.5" y1="4.5" x2="23" y2="6" stroke={color} strokeWidth="1.1" strokeLinecap="round" />
    {/* Reflection head (inside mirror) */}
    <Circle cx="17.5" cy="8" r="2.4" stroke={color} strokeWidth="1.5" />
    {/* Reflection body (inside mirror) */}
    <Path d="M12.5 18.5 Q12.5 13.5 17.5 13.5 Q22.5 13.5 22.5 18.5" stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" />
    {/* Person head (foreground) */}
    <Circle cx="6" cy="10" r="3" stroke={color} strokeWidth="1.6" />
    {/* Person body (foreground) */}
    <Path d="M0 24 Q0 17.5 6 17.5 Q12 17.5 12 24" stroke={color} strokeWidth="1.6" fill="none" strokeLinecap="round" />
  </Svg>
);

// Simple icon component
const TabIcon = ({ name, focused }: { name: string; focused: boolean }) => {
  const color = focused ? colors.accent : colors.textTertiary;

  if (name === 'Home') return <HomeIcon color={color} />;
  if (name === 'Analysis') return <AnalysisIcon color={color} />;
  if (name === 'Timeline') return <TimelineIcon color={color} />;
  if (name === 'Reflection') return <ReflectIcon color={color} />;

  return <Text style={[styles.tabIcon, { color }]}>{'•'}</Text>;
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
        component={HomeScreen}
        options={{
          title: 'Home',
          headerTitle: '',
        }}
      />
      <Tab.Screen
        name="Timeline"
        component={TimelineScreen}
        options={{
          title: 'Timeline',
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
        name="Reflection"
        component={ReflectionScreen}
        options={{
          title: 'Reflect',
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
          // Auth Screen
          <>
            <Stack.Screen
              name="Auth"
              component={AuthScreen}
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
              name="AccountTransactions"
              component={AccountTransactionsScreen}
              options={{ title: 'Transactions' }}
            />
            {/* Keep these for backward compatibility with navigation.navigate calls */}
            <Stack.Screen
              name="Profile"
              component={ProfileScreen}
              options={{ title: 'Profile' }}
            />
            <Stack.Screen
              name="Personality"
              component={PersonalityScreen}
              options={{ title: 'Spending Personality' }}
            />
            <Stack.Screen
              name="PatternDetail"
              component={PatternDetailScreen}
              options={{ headerShown: false }}
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
