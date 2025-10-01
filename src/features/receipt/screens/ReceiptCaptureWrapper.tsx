import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../../../core/constants/theme';

// Conditional imports
let VisionCameraScreen: any = null;
let isVisionCameraAvailable = false;

try {
  // Try to import vision camera components
  const visionCamera = require('react-native-vision-camera');
  if (visionCamera.Camera) {
    VisionCameraScreen = require('./VisionCameraScreen').VisionCameraScreen;
    isVisionCameraAvailable = true;
  }
} catch (error) {
  // Vision camera not available - we're in Expo Go
  console.log('Vision Camera not available - using Expo Camera fallback');
}

// Import Expo camera fallback
import { ReceiptCaptureScreen } from './ReceiptCaptureScreen';

export const ReceiptCaptureWrapper: React.FC = () => {
  // Use Vision Camera if available (development build), otherwise use Expo Camera
  if (isVisionCameraAvailable && VisionCameraScreen) {
    return <VisionCameraScreen />;
  }

  // Fallback to Expo Camera with mock OCR
  return <ReceiptCaptureScreen />;
};