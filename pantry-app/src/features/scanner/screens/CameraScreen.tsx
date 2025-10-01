import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  Image,
  Dimensions,
} from 'react-native';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useHousehold } from '../../../hooks/useHousehold';
import { receiptService } from '../../../services/receiptService';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

export function CameraScreen() {
  const navigation = useNavigation();
  const { currentHousehold } = useHousehold();
  const camera = useRef<Camera>(null);

  const [isProcessing, setIsProcessing] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [ocrText, setOcrText] = useState<string>('');
  const [flashOn, setFlashOn] = useState(false);

  const device = useCameraDevice('back');
  const { hasPermission, requestPermission } = useCameraPermission();

  useEffect(() => {
    if (!hasPermission) {
      requestPermission();
    }
  }, [hasPermission]);

  const captureReceipt = async () => {
    if (!camera.current || !device) return;

    try {
      setIsProcessing(true);

      // Take photo
      const photo = await camera.current.takePhoto({
        flash: flashOn ? 'on' : 'off',
        qualityPrioritization: 'balanced',
      });

      setCapturedPhoto(photo.path);

      // Process with ML Kit
      await processWithOCR(photo.path);
    } catch (error) {
      console.error('Camera capture error:', error);
      Alert.alert('Error', 'Failed to capture photo');
      setIsProcessing(false);
    }
  };

  const processWithOCR = async (photoPath: string) => {
    try {
      // Import ML Kit dynamically
      const MLKit = require('@react-native-ml-kit/text-recognition');

      // Process image with ML Kit
      const result = await MLKit.default.recognize(photoPath);

      if (!result.text || result.text.length < 10) {
        Alert.alert(
          'No text detected',
          'Could not find receipt text. Please try again with better lighting.',
          [{ text: 'Retry', onPress: () => setCapturedPhoto(null) }]
        );
        setIsProcessing(false);
        return;
      }

      setOcrText(result.text);

      // Send to backend for processing
      if (!currentHousehold?.id) {
        Alert.alert('Error', 'No household selected');
        setIsProcessing(false);
        return;
      }

      const processResult = await receiptService.processReceipt(
        result.text,
        currentHousehold.id,
        {
          ocr_confidence: result.blocks?.[0]?.confidence || 0.85,
          use_gemini: false, // Let backend decide
        }
      );

      if (processResult.success) {
        // Navigate to fix queue with items
        navigation.navigate('FixQueue', {
          items: processResult.items,
          receipt: processResult.receipt,
        });
      } else {
        throw new Error(processResult.error?.message || 'Processing failed');
      }
    } catch (error) {
      console.error('OCR processing error:', error);
      Alert.alert(
        'Processing Failed',
        'Could not process the receipt. Please try again.',
        [
          { text: 'Retry', onPress: () => setCapturedPhoto(null) },
          { text: 'Cancel', onPress: () => navigation.goBack() },
        ]
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const retakePhoto = () => {
    setCapturedPhoto(null);
    setOcrText('');
  };

  if (!hasPermission) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.permissionContainer}>
          <Ionicons name="camera-outline" size={64} color="#6B7280" />
          <Text style={styles.permissionTitle}>Camera Permission Required</Text>
          <Text style={styles.permissionText}>
            We need camera access to scan receipts
          </Text>
          <TouchableOpacity
            style={styles.permissionButton}
            onPress={requestPermission}
          >
            <Text style={styles.permissionButtonText}>Grant Permission</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!device) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>Loading camera...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (capturedPhoto) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.previewContainer}>
          <Image source={{ uri: `file://${capturedPhoto}` }} style={styles.previewImage} />

          {isProcessing ? (
            <View style={styles.processingOverlay}>
              <ActivityIndicator size="large" color="#fff" />
              <Text style={styles.processingText}>Extracting text from receipt...</Text>
              {ocrText.length > 0 && (
                <Text style={styles.processingSubtext}>
                  Found {ocrText.split('\n').length} lines
                </Text>
              )}
            </View>
          ) : (
            <View style={styles.previewControls}>
              <TouchableOpacity
                style={[styles.previewButton, styles.retakeButton]}
                onPress={retakePhoto}
              >
                <Ionicons name="refresh" size={24} color="#6B7280" />
                <Text style={styles.retakeButtonText}>Retake</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Camera
        ref={camera}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={true}
        photo={true}
      />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.closeButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="close" size={28} color="#fff" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.flashButton}
          onPress={() => setFlashOn(!flashOn)}
        >
          <Ionicons
            name={flashOn ? 'flash' : 'flash-off'}
            size={24}
            color="#fff"
          />
        </TouchableOpacity>
      </View>

      {/* Guide overlay */}
      <View style={styles.guideContainer}>
        <View style={styles.guideFrame}>
          <View style={[styles.guideCorner, styles.topLeft]} />
          <View style={[styles.guideCorner, styles.topRight]} />
          <View style={[styles.guideCorner, styles.bottomLeft]} />
          <View style={[styles.guideCorner, styles.bottomRight]} />
        </View>
        <Text style={styles.guideText}>
          Position receipt within frame
        </Text>
      </View>

      {/* Capture button */}
      <View style={styles.captureContainer}>
        <TouchableOpacity
          style={styles.captureButton}
          onPress={captureReceipt}
          disabled={isProcessing}
        >
          <View style={styles.captureButtonInner} />
        </TouchableOpacity>
        <Text style={styles.captureHint}>Tap to scan receipt</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    padding: 32,
  },
  permissionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    marginTop: 16,
    marginBottom: 8,
  },
  permissionText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 24,
  },
  permissionButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: '#3B82F6',
    borderRadius: 8,
  },
  permissionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6B7280',
  },
  header: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    zIndex: 10,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  flashButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  guideContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  guideFrame: {
    width: screenWidth * 0.85,
    height: screenHeight * 0.5,
    position: 'relative',
  },
  guideCorner: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderColor: '#3B82F6',
    borderWidth: 3,
  },
  topLeft: {
    top: 0,
    left: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
  },
  topRight: {
    top: 0,
    right: 0,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderRightWidth: 0,
    borderTopWidth: 0,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderLeftWidth: 0,
    borderTopWidth: 0,
  },
  guideText: {
    position: 'absolute',
    bottom: -40,
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  captureContainer: {
    position: 'absolute',
    bottom: 50,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  captureButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#fff',
  },
  captureButtonInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#fff',
  },
  captureHint: {
    marginTop: 12,
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  previewContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  previewImage: {
    flex: 1,
    resizeMode: 'contain',
  },
  processingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  processingText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '500',
    marginTop: 16,
  },
  processingSubtext: {
    color: '#D1D5DB',
    fontSize: 14,
    marginTop: 8,
  },
  previewControls: {
    position: 'absolute',
    bottom: 50,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  previewButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  retakeButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
  },
  retakeButtonText: {
    color: '#6B7280',
    fontSize: 16,
    fontWeight: '500',
    marginLeft: 8,
  },
});