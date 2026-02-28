/**
 * AppNavigator - V1 Navigation Structure
 *
 * Tabs: Pantry, Shopping, Scan, Recipes, Profile
 * V1 Scope: Simplified navigation without Explore/MealPlanning
 */

import React, { useState } from 'react';
import { NavigationContainer, getFocusedRouteNameFromRoute } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { View, Text, StyleSheet, Dimensions, Pressable, ActivityIndicator, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';
import { theme } from '../core/constants/theme';
import { useAuth } from '../contexts/AuthContext';
import { useUsage } from '../hooks/useUsage';
import { FEATURE_FLAGS } from '../config/featureFlags';
import { AuthScreen } from '../features/auth/screens/AuthScreen';
import { InventoryScreen } from '../features/inventory/screens/InventoryScreen';
import { SimpleShoppingListScreen } from '../features/shopping/screens/SimpleShoppingListScreen';
import { ScannerScreen } from '../features/scanner/screens/ScannerScreen';
import { FixQueueScreen } from '../features/receipt/screens/FixQueueScreen';
import { ProfileScreen } from '../features/profile/screens/ProfileScreen';
import { PrivacyPolicyScreen } from '../features/profile/screens/PrivacyPolicyScreen';
import { TermsOfServiceScreen } from '../features/profile/screens/TermsOfServiceScreen';
import { PurchaseHistoryScreen } from '../features/receipt/screens/PurchaseHistoryScreen';
import { ReceiptDetailScreen } from '../features/receipt/screens/ReceiptDetailScreen';
import PasteLinkScreen from '../screens/PasteLinkScreen';
import { CookCardScreen } from '../screens/CookCardScreen';
import { ShareHandlerScreen } from '../screens/ShareHandlerScreen';
import RecipesHeroScreen from '../features/queue/screens/RecipesHeroScreen';
import ManualRecipeEntryScreen from '../features/recipes/screens/ManualRecipeEntryScreen';

const { width: screenWidth } = Dimensions.get('window');

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

const TabIcon: React.FC<{ focused: boolean; icon: string; label: string }> = ({ focused, icon, label }) => (
  <View style={styles.tabIconContainer}>
    <Text style={[styles.tabIcon, focused && styles.tabIconFocused]}>{icon}</Text>
    <Text
      style={[styles.tabLabel, focused && styles.tabLabelFocused]}
      numberOfLines={1}
      adjustsFontSizeToFit={true}
      minimumFontScale={0.5}
      ellipsizeMode="tail"
      allowFontScaling={false}
    >
      {label}
    </Text>
  </View>
);

// Custom tab button with immediate press feedback
const CustomTabButton: React.FC<{ children: React.ReactNode; onPress?: () => void; accessibilityState?: any }> = ({
  children,
  onPress,
  accessibilityState
}) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => [
      styles.tabButton,
      pressed && styles.tabButtonPressed
    ]}
    android_ripple={{ borderless: true, color: theme.colors.primary + '20' }}
  >
    {children}
  </Pressable>
);

// Recipe Stack Navigator - V1: My Recipes only
const RecipeStack = () => (
  <Stack.Navigator
    screenOptions={{
      headerShown: false,
    }}
  >
    <Stack.Screen name="RecipeList" component={RecipesHeroScreen} />
  </Stack.Navigator>
);

// Scan Stack Navigator (renamed from Receipt)
const ScanStack = () => (
  <Stack.Navigator
    screenOptions={{
      headerShown: false,
    }}
  >
    <Stack.Screen name="Scanner" component={ScannerScreen} />
    <Stack.Screen
      name="FixQueue"
      component={FixQueueScreen}
      options={{
        presentation: 'modal',
      }}
    />
  </Stack.Navigator>
);

// Profile Stack Navigator
const ProfileStack = () => (
  <Stack.Navigator
    screenOptions={{
      headerShown: false,
    }}
  >
    <Stack.Screen name="ProfileMain" component={ProfileScreen} />
    <Stack.Screen name="PurchaseHistory" component={PurchaseHistoryScreen} />
    <Stack.Screen name="ReceiptDetail" component={ReceiptDetailScreen} />
    <Stack.Screen
      name="PrivacyPolicy"
      component={PrivacyPolicyScreen}
      options={{
        headerShown: true,
        title: 'Privacy Policy',
        headerStyle: {
          backgroundColor: theme.colors.background,
        },
        headerTintColor: theme.colors.text,
        headerTitleStyle: {
          fontWeight: '600',
        },
      }}
    />
    <Stack.Screen
      name="TermsOfService"
      component={TermsOfServiceScreen}
      options={{
        headerShown: true,
        title: 'Terms of Service',
        headerStyle: {
          backgroundColor: theme.colors.background,
        },
        headerTintColor: theme.colors.text,
        headerTitleStyle: {
          fontWeight: '600',
        },
      }}
    />
  </Stack.Navigator>
);

// Production ad unit IDs — replace with real IDs before release
const AD_UNIT_ID = __DEV__
  ? TestIds.ADAPTIVE_BANNER
  : Platform.select({
      ios: 'ca-app-pub-XXXXXXXXXXXXXXXX/YYYYYYYYYY',
      android: 'ca-app-pub-XXXXXXXXXXXXXXXX/YYYYYYYYYY',
    }) ?? TestIds.ADAPTIVE_BANNER;

// AdBanner - shown below tab bar for free-tier users on allowed tabs
const AdBanner: React.FC<{ activeTab: string }> = ({ activeTab }) => {
  const { usage } = useUsage();
  const [adFailed, setAdFailed] = useState(false);

  if (!FEATURE_FLAGS.ENABLE_ADS) return null;
  if (usage.tier !== 'free') return null;
  if (FEATURE_FLAGS.ADS_HIDDEN_TABS.includes(activeTab)) return null;
  if (adFailed) return null;

  return (
    <BannerAd
      unitId={AD_UNIT_ID}
      size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
      requestOptions={{ requestNonPersonalizedAdsOnly: false }}
      onAdFailedToLoad={() => setAdFailed(true)}
    />
  );
};

// Bottom Tab Navigator - V1 Labels
const TabNavigatorInner = () => {
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={{
        tabBarStyle: {
          backgroundColor: theme.colors.background,
          borderTopWidth: 1,
          borderTopColor: theme.colors.border,
          paddingBottom: Math.max(insets.bottom, 8),
          paddingTop: 8,
          height: Math.max(insets.bottom, 20) + 60,
        },
        tabBarShowLabel: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textLight,
        headerShown: false
      }}
    >
      <Tab.Screen
        name="Pantry"
        component={InventoryScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} icon="📦" label="Pantry" />
          ),
          tabBarButton: (props) => (
            <CustomTabButton {...props} />
          ),
        }}
      />
      <Tab.Screen
        name="Shopping"
        component={SimpleShoppingListScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} icon="🛒" label="Shopping" />
          ),
          tabBarButton: (props) => (
            <CustomTabButton {...props} />
          ),
        }}
      />
      <Tab.Screen
        name="Scan"
        component={ScanStack}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} icon="🧾" label="Scan" />
          ),
          tabBarButton: (props) => (
            <CustomTabButton {...props} />
          ),
        }}
      />
      <Tab.Screen
        name="Recipes"
        component={RecipeStack}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} icon="🍴" label="Recipes" />
          ),
          tabBarButton: (props) => (
            <CustomTabButton {...props} />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileStack}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} icon="👤" label="Profile" />
          ),
          tabBarButton: (props) => (
            <CustomTabButton {...props} />
          ),
        }}
      />
    </Tab.Navigator>
  );
};

// TabNavigator with AdBanner below the tab bar
const TabNavigator: React.FC<{ route?: any }> = ({ route }) => {
  const activeTab = getFocusedRouteNameFromRoute(route ?? {}) ?? 'Pantry';

  return (
    <View style={{ flex: 1 }}>
      <TabNavigatorInner />
      <AdBanner activeTab={activeTab} />
    </View>
  );
};

// Loading Screen
const LoadingScreen = () => (
  <View style={styles.loadingContainer}>
    <ActivityIndicator size="large" color={theme.colors.primary} />
    <Text style={styles.loadingText}>Loading...</Text>
  </View>
);

// Main Stack Navigator for modals
export const AppNavigator: React.FC = () => {
  const { session, loading, hasProfile, isInitialized } = useAuth();

  console.log('[AppNavigator] State:', {
    loading,
    isInitialized,
    hasSession: !!session,
    hasProfile
  });

  if (loading || !isInitialized) {
    return <LoadingScreen />;
  }

  // User must have both a session AND a profile to access the app
  const hasValidSession = session && hasProfile;

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
        }}
      >
        {hasValidSession ? (
          <>
            <Stack.Screen name="Main" component={TabNavigator} />
            {/* Modal screens */}
            <Stack.Screen
              name="PasteLink"
              component={PasteLinkScreen}
              options={{ presentation: 'modal' }}
            />
            <Stack.Screen
              name="CookCard"
              component={CookCardScreen}
              options={{ presentation: 'modal' }}
            />
            <Stack.Screen
              name="ManualRecipeEntry"
              component={ManualRecipeEntryScreen}
              options={{ presentation: 'modal' }}
            />
            <Stack.Screen
              name="ShareHandler"
              component={ShareHandlerScreen}
              options={{ presentation: 'modal' }}
            />
          </>
        ) : (
          <Stack.Screen name="Auth" component={AuthScreen} />
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
    backgroundColor: theme.colors.background,
  },
  loadingText: {
    marginTop: theme.spacing.md,
    fontSize: 16,
    color: theme.colors.textSecondary,
  },
  tabIconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: screenWidth / 5 - 8,
  },
  tabIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  tabIconFocused: {
    transform: [{ scale: 1.1 }],
  },
  tabLabel: {
    fontSize: 11,
    color: theme.colors.textLight,
    textAlign: 'center',
    minWidth: 55,
    maxWidth: screenWidth / 5 - 10,
  },
  tabLabelFocused: {
    color: theme.colors.primary,
    fontWeight: '600',
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  tabButtonPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.95 }],
  },
});
