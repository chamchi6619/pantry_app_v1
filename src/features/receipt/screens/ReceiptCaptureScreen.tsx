import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Dimensions,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import { theme } from '../../../core/constants/theme';
import { Button } from '../../../core/components/ui/Button';
import { useNavigation } from '@react-navigation/native';
import { ocrService } from '../../../services/ocrService';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

export const ReceiptCaptureScreen: React.FC = () => {
  const navigation = useNavigation();
  const [permission, requestPermission] = useCameraPermissions();
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  useEffect(() => {
    if (permission?.granted) {
      setShowCamera(true);
    }
  }, [permission]);

  const handleRequestPermission = async () => {
    const result = await requestPermission();
    if (result.granted) {
      setShowCamera(true);
    }
  };

  const handleCapture = async () => {
    if (!cameraRef.current || !isCameraReady || isCapturing) return;

    try {
      setIsCapturing(true);

      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: false,
        skipProcessing: false,
      });

      if (photo) {
        // Process the image for better OCR
        const processed = await processImage(photo.uri);
        setCapturedImage(processed);
        setShowCamera(false);

        // Immediately process with mock OCR
        handleProcessReceipt(processed);
      }
    } catch (error) {
      console.error('Capture error:', error);
      Alert.alert('Error', 'Failed to capture receipt. Please try again.');
    } finally {
      setIsCapturing(false);
    }
  };

  const processImage = async (uri: string): Promise<string> => {
    try {
      // Simple preprocessing: resize and adjust quality
      const manipulated = await ImageManipulator.manipulateAsync(
        uri,
        [
          { resize: { width: 1280 } }, // Max width per our plan
        ],
        {
          compress: 0.85,
          format: ImageManipulator.SaveFormat.JPEG,
        }
      );

      return manipulated.uri;
    } catch (error) {
      console.error('Image processing error:', error);
      return uri; // Return original if processing fails
    }
  };

  const handleProcessReceipt = async (imageUri: string) => {
    setIsProcessing(true);

    try {
      // Perform OCR on the image
      const ocrResult = await ocrService.performOCR(imageUri);

      // Parse the OCR result into structured data
      const receiptData = ocrService.parseReceipt(ocrResult);

      // Add categories to items
      receiptData.items = receiptData.items.map(item => ({
        ...item,
        category: ocrService.detectCategory(item.name),
      }));

      // Navigate to Fix Queue with parsed data
      navigation.navigate('ReceiptFixQueue' as never, {
        receiptData,
        imageUri,
        ocrConfidence: ocrResult.confidence,
      } as never);

      setCapturedImage(null);
    } catch (error) {
      console.error('OCR processing error:', error);
      Alert.alert('Processing Error', 'Failed to process receipt. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const generateMockReceiptData = () => {
    return {
      id: Date.now().toString(),
      storeName: 'Whole Foods Market',
      date: new Date().toISOString(),
      total: 47.82,
      currency: 'USD',
      items: [
        {
          id: '1',
          rawText: 'ORGANIC MILK',
          name: 'Organic Milk',
          quantity: 1,
          unit: 'gal',
          price: 5.99,
          confidence: 0.92,
          needsReview: false,
        },
        {
          id: '2',
          rawText: 'LETTUCE',
          name: 'Lettuce',
          quantity: 2,
          unit: 'head',
          price: 3.49,
          confidence: 0.85,
          needsReview: false,
        },
        {
          id: '3',
          rawText: 'CARROTS 2LB',
          name: 'Carrots',
          quantity: 2,
          unit: 'lb',
          price: 4.99,
          confidence: 0.78,
          needsReview: true,
        },
        {
          id: '4',
          rawText: 'CHKN BRST',
          name: 'Chicken Breast',
          quantity: 1.5,
          unit: 'lb',
          price: 12.50,
          confidence: 0.65,
          needsReview: true,
        },
        {
          id: '5',
          rawText: 'PASTA',
          name: 'Pasta',
          quantity: 1,
          unit: 'box',
          price: 2.99,
          confidence: 0.88,
          needsReview: false,
        },
      ],
    };
  };

  const handleRetake = () => {
    setCapturedImage(null);
    setShowCamera(true);
  };

  const renderCameraControls = () => (
    <View style={styles.cameraContainer}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing="back"
        onCameraReady={() => setIsCameraReady(true)}
      >
        <View style={styles.cameraOverlay}>
          {/* Frame corners for guidance */}
          <View style={styles.frameGuide}>
            <Text style={[styles.frameCorner, styles.topLeft]}>┌</Text>
            <Text style={[styles.frameCorner, styles.topRight]}>┐</Text>
            <Text style={[styles.frameCorner, styles.bottomLeft]}>└</Text>
            <Text style={[styles.frameCorner, styles.bottomRight]}>┘</Text>
          </View>

          {/* Instructions */}
          <View style={styles.instructionContainer}>
            <Text style={styles.instructionText}>Position receipt within frame</Text>
            <Text style={styles.instructionSubtext}>Ensure entire receipt is visible</Text>
          </View>
        </View>
      </CameraView>

      {/* Capture button */}
      <View style={styles.captureButtonContainer}>
        <Pressable
          style={[styles.captureButton, isCapturing && styles.captureButtonDisabled]}
          onPress={handleCapture}
          disabled={!isCameraReady || isCapturing}
        >
          <View style={styles.captureButtonInner} />
        </Pressable>

        <Pressable
          style={styles.closeButton}
          onPress={() => setShowCamera(false)}
        >
          <Text style={styles.closeButtonText}>✕</Text>
        </Pressable>
      </View>
    </View>
  );

  const renderPermissionRequest = () => (
    <View style={styles.permissionContainer}>
      <Text style={styles.permissionIcon}>📷</Text>
      <Text style={styles.permissionTitle}>Camera Permission Required</Text>
      <Text style={styles.permissionText}>
        We need camera access to scan receipts and automatically add items to your pantry inventory.
      </Text>
      <Button variant="primary" onPress={handleRequestPermission}>
        <Text style={styles.buttonText}>Grant Camera Access</Text>
      </Button>
    </View>
  );

  const renderProcessing = () => (
    <View style={styles.processingContainer}>
      <ActivityIndicator size="large" color={theme.colors.primary} />
      <Text style={styles.processingTitle}>Processing Receipt...</Text>
      <Text style={styles.processingText}>Extracting items from your receipt</Text>
    </View>
  );

  const renderTips = () => (
    <View style={styles.content}>
      <View style={styles.previewSection}>
        <View style={styles.previewFrame}>
          <Text style={styles.previewIcon}>📸</Text>
          <Text style={styles.previewText}>Tap to start camera</Text>
        </View>
      </View>

      <View style={styles.tipsSection}>
        <Text style={styles.tipsTitle}>Tips for better scanning:</Text>
        <Text style={styles.tipItem}>• Ensure good lighting</Text>
        <Text style={styles.tipItem}>• Keep receipt flat and straight</Text>
        <Text style={styles.tipItem}>• Include entire receipt in frame</Text>
        <Text style={styles.tipItem}>• Avoid shadows and glare</Text>
      </View>

      <View style={styles.actionSection}>
        <Button
          variant="primary"
          onPress={() => setShowCamera(true)}
          disabled={!permission?.granted}
        >
          <Text style={styles.captureButtonText}>📸 Start Camera</Text>
        </Button>
      </View>
    </View>
  );

  if (!permission) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Receipt Capture</Text>
        <Pressable style={styles.historyButton} onPress={() => navigation.goBack()}>
          <Text style={styles.historyIcon}>←</Text>
        </Pressable>
      </View>

      {!permission.granted ? (
        renderPermissionRequest()
      ) : isProcessing ? (
        renderProcessing()
      ) : showCamera ? (
        renderCameraControls()
      ) : (
        <ScrollView style={styles.scrollView}>
          {renderTips()}
        </ScrollView>
      )}
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
  historyButton: {
    padding: theme.spacing.sm,
  },
  historyIcon: {
    fontSize: 24,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  cameraContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  cameraOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  frameGuide: {
    width: screenWidth * 0.85,
    height: screenHeight * 0.6,
    position: 'relative',
  },
  frameCorner: {
    position: 'absolute',
    color: theme.colors.primary,
    fontSize: 32,
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
  instructionContainer: {
    position: 'absolute',
    bottom: 100,
    alignItems: 'center',
  },
  instructionText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  instructionSubtext: {
    color: '#fff',
    fontSize: 14,
    marginTop: 4,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  captureButtonContainer: {
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
  },
  captureButtonDisabled: {
    opacity: 0.5,
  },
  captureButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#fff',
  },
  closeButton: {
    position: 'absolute',
    top: -20,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '300',
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
  previewSection: {
    padding: theme.spacing.lg,
    alignItems: 'center',
  },
  previewFrame: {
    width: screenWidth - theme.spacing.xl * 2,
    height: (screenWidth - theme.spacing.xl * 2) * 1.2,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 2,
    borderColor: theme.colors.border,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewIcon: {
    fontSize: 48,
    marginBottom: theme.spacing.md,
  },
  previewText: {
    fontSize: 16,
    color: theme.colors.textSecondary,
  },
  tipsSection: {
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.xl,
  },
  tipsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  tipItem: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
    paddingLeft: theme.spacing.sm,
  },
  actionSection: {
    padding: theme.spacing.lg,
  },
  captureButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.textInverse,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});