import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useFrameProcessor,
  runAtTargetFps,
} from 'react-native-vision-camera';
import { useRunOnJS } from 'react-native-worklets-core';
import { useNavigation } from '@react-navigation/native';
import { theme } from '../../../core/constants/theme';
import { Button } from '../../../core/components/ui/Button';
import { nativeOCRService, OCRResult } from '../../../services/nativeOcrService';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

export const VisionCameraScreen: React.FC = () => {
  const navigation = useNavigation();
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');

  const [isActive, setIsActive] = useState(true);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [ocrText, setOcrText] = useState<string>('');
  const [capturedTexts, setCapturedTexts] = useState<string[]>([]);
  const captureTimeoutRef = useRef<NodeJS.Timeout>();

  // Callback to handle OCR results
  const onOCRResult = useCallback((result: OCRResult | null) => {
    if (result && result.text) {
      setOcrText(result.text);

      // Accumulate text if capturing
      if (isCapturing) {
        setCapturedTexts(prev => [...prev, result.text]);
      }
    }
  }, [isCapturing]);

  // Frame processor for real-time OCR
  const frameProcessor = useFrameProcessor((frame) => {
    'worklet';

    // Run OCR at 2 FPS to conserve resources
    runAtTargetFps(2, () => {
      const result = nativeOCRService.processOCRFrame(frame);
      if (result) {
        runOnJS(onOCRResult)(result);
      }
    });
  }, [onOCRResult]);

  // Handle camera permission
  useEffect(() => {
    if (!hasPermission) {
      requestPermission();
    }
  }, [hasPermission, requestPermission]);

  // Start capture process
  const handleStartCapture = () => {
    setIsCapturing(true);
    setCapturedTexts([]);

    // Auto-stop capture after 5 seconds
    captureTimeoutRef.current = setTimeout(() => {
      handleStopCapture();
    }, 5000);
  };

  // Stop capture and process results
  const handleStopCapture = () => {
    if (captureTimeoutRef.current) {
      clearTimeout(captureTimeoutRef.current);
    }

    setIsCapturing(false);
    setIsProcessing(true);

    // Process accumulated text
    const combinedText = nativeOCRService.processAccumulatedText(capturedTexts);

    // Parse the receipt
    const ocrResult: OCRResult = {
      text: combinedText,
      blocks: [],
      confidence: 0.85,
    };

    const receiptData = nativeOCRService.parseReceipt(ocrResult);

    // Navigate to Fix Queue with parsed data
    navigation.navigate('ReceiptFixQueue' as never, {
      receiptData,
      imageUri: null, // No single image with frame processor
      ocrConfidence: ocrResult.confidence,
    } as never);

    setIsProcessing(false);
    setCapturedTexts([]);
  };

  // Render permission request
  if (!hasPermission) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.permissionContainer}>
          <Text style={styles.permissionIcon}>📷</Text>
          <Text style={styles.permissionTitle}>Camera Permission Required</Text>
          <Text style={styles.permissionText}>
            We need camera access to scan receipts and automatically add items to your pantry inventory.
          </Text>
          <Button variant="primary" onPress={requestPermission}>
            <Text style={styles.buttonText}>Grant Camera Access</Text>
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  // Render no device available
  if (!device) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.errorText}>No camera device available</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Render processing
  if (isProcessing) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.processingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.processingTitle}>Processing Receipt...</Text>
          <Text style={styles.processingText}>Extracting items from captured text</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Scan Receipt</Text>
        <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backIcon}>←</Text>
        </Pressable>
      </View>

      <View style={styles.cameraContainer}>
        <Camera
          style={styles.camera}
          device={device}
          isActive={isActive && !isProcessing}
          frameProcessor={frameProcessor}
          fps={30}
        >
          <View style={styles.overlay}>
            {/* Frame guide */}
            <View style={styles.frameGuide}>
              <Text style={[styles.frameCorner, styles.topLeft]}>┌</Text>
              <Text style={[styles.frameCorner, styles.topRight]}>┐</Text>
              <Text style={[styles.frameCorner, styles.bottomLeft]}>└</Text>
              <Text style={[styles.frameCorner, styles.bottomRight]}>┘</Text>
            </View>

            {/* Live OCR preview */}
            <View style={styles.ocrPreview}>
              <Text style={styles.ocrPreviewTitle}>
                {isCapturing ? 'Capturing...' : 'Live Preview'}
              </Text>
              <Text style={styles.ocrPreviewText} numberOfLines={3}>
                {ocrText || 'Position receipt within frame'}
              </Text>
            </View>
          </View>
        </Camera>

        {/* Control buttons */}
        <View style={styles.controls}>
          {!isCapturing ? (
            <Pressable style={styles.captureButton} onPress={handleStartCapture}>
              <View style={styles.captureButtonInner} />
            </Pressable>
          ) : (
            <Pressable style={styles.stopButton} onPress={handleStopCapture}>
              <View style={styles.stopButtonInner} />
            </Pressable>
          )}

          <Text style={styles.instructionText}>
            {isCapturing
              ? 'Scanning receipt... Move slowly over all items'
              : 'Tap to start scanning'
            }
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  title: {
    ...theme.typography.h2,
    color: theme.colors.text,
  },
  backButton: {
    padding: theme.spacing.sm,
  },
  backIcon: {
    fontSize: 24,
  },
  cameraContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  frameGuide: {
    width: screenWidth * 0.85,
    height: screenHeight * 0.5,
    position: 'relative',
  },
  frameCorner: {
    position: 'absolute',
    color: theme.colors.primary,
    fontSize: 40,
    fontWeight: '300',
  },
  topLeft: {
    top: 0,
    left: 0,
  },
  topRight: {
    top: 0,
    right: 0,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
  },
  ocrPreview: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
  },
  ocrPreviewTitle: {
    color: theme.colors.primary,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  ocrPreviewText: {
    color: '#fff',
    fontSize: 11,
    lineHeight: 14,
  },
  controls: {
    position: 'absolute',
    bottom: 40,
    width: '100%',
    alignItems: 'center',
  },
  captureButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(255,255,255,0.3)',
    padding: 4,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  captureButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#fff',
  },
  stopButton: {
    width: 70,
    height: 70,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.3)',
    padding: 4,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  stopButtonInner: {
    width: 30,
    height: 30,
    borderRadius: 4,
    backgroundColor: theme.colors.error,
  },
  instructionText: {
    color: '#fff',
    fontSize: 14,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.xl,
  },
  permissionIcon: {
    fontSize: 64,
    marginBottom: theme.spacing.lg,
  },
  permissionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
    textAlign: 'center',
  },
  permissionText: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: theme.spacing.xl,
    lineHeight: 22,
  },
  buttonText: {
    color: theme.colors.textInverse,
    fontSize: 16,
    fontWeight: '600',
  },
  processingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.xl,
  },
  processingTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: theme.colors.text,
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
  },
  processingText: {
    fontSize: 16,
    color: theme.colors.textSecondary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    color: theme.colors.error,
  },
});