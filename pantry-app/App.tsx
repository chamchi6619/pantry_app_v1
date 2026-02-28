import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { requestTrackingPermissionsAsync } from 'expo-tracking-transparency';
import mobileAds from 'react-native-google-mobile-ads';
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
    (async () => {
      if (Platform.OS === 'ios') {
        await requestTrackingPermissionsAsync();
      }
      await mobileAds().initialize();
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