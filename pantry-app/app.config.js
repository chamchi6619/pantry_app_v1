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
      buildNumber: '1',
      infoPlist: {
        NSCameraUsageDescription:
          'This app uses the camera to scan receipts and automatically add items to your pantry inventory.',
        NSPhotoLibraryUsageDescription:
          'This app needs access to photo library to save scanned receipts.',
        NSUserTrackingUsageDescription:
          'This identifier will be used to deliver personalized ads to you.',
        CFBundleURLTypes: [
          {
            CFBundleURLSchemes: ['pantryapp']
          }
        ],
        SKAdNetworkItems: [
          { SKAdNetworkIdentifier: 'cstr6suwn9.skadnetwork' },
          { SKAdNetworkIdentifier: '4fzdc2evr5.skadnetwork' },
          { SKAdNetworkIdentifier: '4pfyvq9l8r.skadnetwork' },
          { SKAdNetworkIdentifier: '2fnua5tdw4.skadnetwork' },
          { SKAdNetworkIdentifier: 'ydx93a7ass.skadnetwork' },
          { SKAdNetworkIdentifier: '5a6flpkh64.skadnetwork' },
          { SKAdNetworkIdentifier: 'p78axxw29g.skadnetwork' },
          { SKAdNetworkIdentifier: 'v72qych5uu.skadnetwork' },
          { SKAdNetworkIdentifier: 'ludvb6z3bs.skadnetwork' },
          { SKAdNetworkIdentifier: 'cp8zw746q7.skadnetwork' },
          { SKAdNetworkIdentifier: 'c6k4g5qg8m.skadnetwork' },
          { SKAdNetworkIdentifier: 's39g8k73mm.skadnetwork' },
          { SKAdNetworkIdentifier: '3qy4746246.skadnetwork' },
          { SKAdNetworkIdentifier: '3sh42y64q3.skadnetwork' },
          { SKAdNetworkIdentifier: 'f38h382jlk.skadnetwork' },
          { SKAdNetworkIdentifier: 'hs6bdukanm.skadnetwork' },
          { SKAdNetworkIdentifier: 'prcb7njmu6.skadnetwork' },
          { SKAdNetworkIdentifier: 'v4nxqhlyqp.skadnetwork' },
          { SKAdNetworkIdentifier: 'wzmmz9fp6w.skadnetwork' },
          { SKAdNetworkIdentifier: 'yclnxrl5pm.skadnetwork' },
          { SKAdNetworkIdentifier: 't38b2kh725.skadnetwork' },
          { SKAdNetworkIdentifier: '7ug5zh24hu.skadnetwork' },
          { SKAdNetworkIdentifier: '9rd848q2bz.skadnetwork' },
          { SKAdNetworkIdentifier: 'y5ghdn5j9k.skadnetwork' },
          { SKAdNetworkIdentifier: 'n6fk4nfna4.skadnetwork' },
          { SKAdNetworkIdentifier: 'v9wttpbfk9.skadnetwork' },
          { SKAdNetworkIdentifier: 'n38lu8286q.skadnetwork' },
          { SKAdNetworkIdentifier: '47vhws6wlr.skadnetwork' },
          { SKAdNetworkIdentifier: 'kbd757ywx3.skadnetwork' },
          { SKAdNetworkIdentifier: '9t245vhmpl.skadnetwork' },
          { SKAdNetworkIdentifier: 'a2p9lx4jpn.skadnetwork' },
          { SKAdNetworkIdentifier: '22mmun2rn5.skadnetwork' },
          { SKAdNetworkIdentifier: '4468km3ulz.skadnetwork' },
          { SKAdNetworkIdentifier: '2u9pt9hc89.skadnetwork' },
          { SKAdNetworkIdentifier: '8s468mfl3y.skadnetwork' },
          { SKAdNetworkIdentifier: 'av6w8kgt66.skadnetwork' },
          { SKAdNetworkIdentifier: 'klf5c3l5u5.skadnetwork' },
          { SKAdNetworkIdentifier: 'ppxm28t8ap.skadnetwork' },
          { SKAdNetworkIdentifier: '424m5254lk.skadnetwork' },
          { SKAdNetworkIdentifier: 'ecpz2srf59.skadnetwork' },
          { SKAdNetworkIdentifier: 'uw77j35x4d.skadnetwork' },
          { SKAdNetworkIdentifier: 'mlmmfzh3r3.skadnetwork' },
          { SKAdNetworkIdentifier: '578prtvx9j.skadnetwork' },
          { SKAdNetworkIdentifier: '4dzt52r2t5.skadnetwork' },
          { SKAdNetworkIdentifier: 'gta9lk7p23.skadnetwork' },
          { SKAdNetworkIdentifier: 'e5fvkxwrpn.skadnetwork' },
          { SKAdNetworkIdentifier: '8c4e2ghe7u.skadnetwork' },
          { SKAdNetworkIdentifier: 'zq492l623r.skadnetwork' },
          { SKAdNetworkIdentifier: '3rd42ekr43.skadnetwork' },
          { SKAdNetworkIdentifier: '3qcr597p9d.skadnetwork' },
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
          androidAppId: 'ca-app-pub-3940256099942544~3347511713',
          iosAppId: 'ca-app-pub-9273318679388213~1498469096',
        },
      ],
      'expo-tracking-transparency',
    ],
  },
};