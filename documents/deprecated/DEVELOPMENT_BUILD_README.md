# Development Build Instructions for Pantry Pal

This document explains how to create and run a development build with native OCR capabilities.

## Prerequisites

1. EAS CLI installed globally: `npm install -g eas-cli`
2. Expo account (free): https://expo.dev/
3. Xcode (for iOS) and/or Android Studio (for Android)

## Current Setup

The app is configured with two OCR modes:

1. **Expo Go Mode** (Default): Uses mock OCR for testing in Expo Go
2. **Development Build Mode**: Uses real OCR with native modules

## Building the Development Client

### 1. Login to EAS

```bash
eas login
```

### 2. Configure EAS Project (First time only)

```bash
eas build:configure
```

### 3. Build for iOS Simulator

```bash
eas build --platform ios --profile development
```

### 4. Build for Android

```bash
eas build --platform android --profile development
```

### 5. Build for Physical iOS Device

```bash
eas build --platform ios --profile development --clear-cache
```

## Installing the Development Build

### iOS Simulator
1. After build completes, download the .app file
2. Drag and drop onto the iOS Simulator

### Android
1. After build completes, download the .apk file
2. Install using: `adb install path-to-your.apk`

### Physical iOS Device
1. Register your device with `eas device:create`
2. Build with the device registered
3. Install using TestFlight or Ad Hoc distribution

## Running the Development Build

```bash
npx expo start --dev-client
```

Then scan the QR code with your development build (not Expo Go).

## Features Available in Development Build

- Real-time OCR using device camera
- Text recognition from receipts
- Frame processor for continuous scanning
- ML Kit text recognition (Google)

## Troubleshooting

### Build Fails
- Clear cache: `eas build --clear-cache`
- Check `eas.json` configuration
- Ensure all native dependencies are installed

### OCR Not Working
- Check camera permissions are granted
- Ensure development build (not Expo Go)
- Check console for errors

### Metro Bundler Issues
```bash
npx expo start --clear
```

## Testing OCR

1. Launch app in development build
2. Navigate to Receipt tab
3. Grant camera permission
4. Point camera at receipt
5. Live OCR preview should show detected text
6. Tap capture to scan full receipt

## Fallback Behavior

The app automatically detects if running in:
- **Expo Go**: Uses Expo Camera with mock OCR
- **Development Build**: Uses Vision Camera with real OCR

No code changes needed - it adapts automatically!