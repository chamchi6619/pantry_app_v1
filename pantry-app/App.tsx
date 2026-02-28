import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppNavigator } from './src/navigation/AppNavigator';
import { AuthProvider } from './src/contexts/AuthContext';
import { initAnalytics, trackEvent } from './src/services/analyticsService';
import { configurePurchases } from './src/services/purchaseService';

export default function App() {
  useEffect(() => {
    initAnalytics();
    trackEvent('app_opened');
    configurePurchases();

    // ATT prompt (iOS only) then initialize mobile ads
    // Dynamic imports: these are native modules unavailable in Expo Go
    (async () => {
      try {
        if (Platform.OS === 'ios') {
          const { requestTrackingPermissionsAsync } = await import('expo-tracking-transparency');
          await requestTrackingPermissionsAsync();
        }
        const { default: mobileAds } = await import('react-native-google-mobile-ads');
        await mobileAds().initialize();
      } catch {
        console.log('AdMob init skipped (native module unavailable)');
      }
    })();
  }, []);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="auto" />
        <AppNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}