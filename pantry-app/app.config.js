export default {
  expo: {
    name: 'Pantry Pal',
    slug: 'pantry-pal',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    scheme: 'pantryapp',
    extra: {
      eas: {
        projectId: 'cf90aca2-e420-4071-b27c-b1f5f74a7fb0'
      }
    },
    splash: {
      image: './assets/splash.png',
      resizeMode: 'contain',
      backgroundColor: '#ffffff',
    },
    assetBundlePatterns: ['**/*'],
    ios: {
      supportsTablet: false,
      bundleIdentifier: 'com.taeyoungpark.pantrypal',
      infoPlist: {
        NSCameraUsageDescription:
          'This app uses the camera to scan receipts and automatically add items to your pantry inventory.',
        NSPhotoLibraryUsageDescription:
          'This app needs access to photo library to save scanned receipts.',
        NSUserTrackingUsageDescription:
          'This allows us to show you more relevant ads and improve your experience.',
        CFBundleURLTypes: [
          {
            CFBundleURLSchemes: ['pantryapp']
          }
        ],
      },
      config: {
        usesNonExemptEncryption: false
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#FFFFFF',
      },
      package: 'com.taeyoungpark.pantrypal',
      permissions: ['CAMERA'],
    },
    web: {
      favicon: './assets/favicon.png',
    },
    plugins: [
      'expo-dev-client',
      [
        'expo-build-properties',
        {
          ios: {
            deploymentTarget: '16.0',
          },
          android: {
            minSdkVersion: 24,
          },
        },
      ],
      [
        'react-native-google-mobile-ads',
        {
          androidAppId: 'ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY',
          iosAppId: 'ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY',
        },
      ],
      'expo-tracking-transparency',
    ],
  },
};