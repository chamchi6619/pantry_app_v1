import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { View, Text, StyleSheet, Platform, Dimensions, Pressable, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../core/constants/theme';
import { useAuth } from '../contexts/AuthContext';
import { AuthScreen } from '../features/auth/screens/AuthScreen';
import { InventoryScreen } from '../features/inventory/screens/InventoryScreen';
import { SimpleShoppingListScreen } from '../features/shopping/screens/SimpleShoppingListScreen';
// import { EnhancedRecipesScreen } from '../features/recipes/screens/EnhancedRecipesScreen';
// import { SimpleRecipesScreen } from '../features/recipes/screens/SimpleRecipesScreen';
import { ExploreRecipesScreen } from '../features/recipes/screens/ExploreRecipesScreen';
import { RecipeDetailScreen } from '../features/recipes/screens/RecipeDetailScreen';
import { RecipeFormScreen } from '../features/recipes/screens/RecipeFormScreen';
import { ScannerScreen } from '../features/scanner/screens/ScannerScreen';
import { FixQueueScreen } from '../features/receipt/screens/FixQueueScreen';
import { ProfileScreen } from '../features/profile/screens/ProfileScreen';

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

// Recipe Stack Navigator
const RecipeStack = () => (
  <Stack.Navigator
    screenOptions={{
      headerShown: false,
    }}
  >
    <Stack.Screen name="RecipeList" component={ExploreRecipesScreen} />
    <Stack.Screen name="RecipeDetail" component={RecipeDetailScreen} />
    <Stack.Screen name="RecipeForm" component={RecipeFormScreen} />
  </Stack.Navigator>
);

// Receipt Stack Navigator
const ReceiptStack = () => (
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

// Bottom Tab Navigator
const TabNavigator = () => {
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
        name="Inventory"
        component={InventoryScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} icon="📦" label="Inventory" />
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
        name="Receipt"
        component={ReceiptStack}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} icon="🧾" label="Receipt" />
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
        component={ProfileScreen}
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
  // Profile is 1:1 with auth user, household is optional
  const hasValidSession = session && hasProfile;

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
        }}
      >
        {hasValidSession ? (
          <Stack.Screen name="Main" component={TabNavigator} />
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
  placeholderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
  },
  placeholderText: {
    fontSize: 48,
    marginBottom: theme.spacing.md,
  },
  placeholderTitle: {
    ...theme.typography.h2,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  placeholderSubtitle: {
    ...theme.typography.body,
    color: theme.colors.textLight,
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