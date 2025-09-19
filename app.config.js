export default {
  expo: {
    name: 'Pantry Pal',
    slug: 'pantry-pal',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    splash: {
      image: './assets/splash.png',
      resizeMode: 'contain',
      backgroundColor: '#ffffff',
    },
    assetBundlePatterns: ['**/*'],
    ios: {
      supportsTablet: false,
      bundleIdentifier: 'com.pantrypal.app',
      infoPlist: {
        NSCameraUsageDescription:
          'This app uses the camera to scan receipts and automatically add items to your pantry inventory.',
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#FFFFFF',
      },
      package: 'com.pantrypal.app',
      permissions: ['CAMERA'],
    },
    web: {
      favicon: './assets/favicon.png',
    },
    plugins: [
      'expo-dev-client',
      [
        'react-native-vision-camera',
        {
          cameraPermissionText: 'Pantry Pal needs access to your camera to scan receipts.',
          enableMicrophonePermission: false,
        },
      ],
    ],
  },
};