import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { View, Text, StyleSheet, Platform, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../core/constants/theme';
import { InventoryScreen } from '../features/inventory/screens/InventoryScreen';
import { ShoppingListScreen } from '../features/shopping/screens/ShoppingListScreen';
import { EnhancedRecipesScreen } from '../features/recipes/screens/EnhancedRecipesScreen';
import { RecipeDetailScreen } from '../features/recipes/screens/RecipeDetailScreen';
import { RecipeFormScreen } from '../features/recipes/screens/RecipeFormScreen';
import { ReceiptCaptureWrapper } from '../features/receipt/screens/ReceiptCaptureWrapper';
import { ReceiptFixQueueScreen } from '../features/receipt/screens/ReceiptFixQueueScreen';

const { width: screenWidth } = Dimensions.get('window');

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

// Placeholder screen
const ProfileScreen = () => (
  <View style={styles.placeholderContainer}>
    <Text style={styles.placeholderText}>👤</Text>
    <Text style={styles.placeholderTitle}>Profile</Text>
    <Text style={styles.placeholderSubtitle}>Coming soon</Text>
  </View>
);

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

// Recipe Stack Navigator
const RecipeStack = () => (
  <Stack.Navigator
    screenOptions={{
      headerShown: false,
    }}
  >
    <Stack.Screen name="RecipeList" component={EnhancedRecipesScreen} />
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
    <Stack.Screen name="ReceiptCapture" component={ReceiptCaptureWrapper} />
    <Stack.Screen
      name="ReceiptFixQueue"
      component={ReceiptFixQueueScreen}
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
        headerShown: false,
      }}
    >
      <Tab.Screen
        name="Inventory"
        component={InventoryScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} icon="📦" label="Inventory" />
          ),
        }}
      />
      <Tab.Screen
        name="Shopping"
        component={ShoppingListScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} icon="🛒" label="Shopping" />
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
        }}
      />
      <Tab.Screen
        name="Recipes"
        component={RecipeStack}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} icon="🍴" label="Recipes" />
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
        }}
      />
    </Tab.Navigator>
  );
};

// Main Stack Navigator for modals
export const AppNavigator: React.FC = () => {
  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
        }}
      >
        <Stack.Screen name="Main" component={TabNavigator} />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
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
});