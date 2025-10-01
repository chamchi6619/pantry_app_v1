import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  Image,
  ScrollView,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useHousehold } from '../../../hooks/useHousehold';
import { receiptService } from '../../../services/receiptService';
import { offlineQueueService } from '../../../services/offlineQueueService';

export function ScannerScreen() {
  const navigation = useNavigation();
  const { currentHousehold } = useHousehold();

  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractedText, setExtractedText] = useState<string>('');
  const [processStage, setProcessStage] = useState<string>('');

  const pickImageFromCamera = async () => {
    const result = await ImagePicker.requestCameraPermissionsAsync();
    if (result.status !== 'granted') {
      Alert.alert('Permission needed', 'Camera permission is required to scan receipts');
      return;
    }

    const imageResult = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.9,  // Higher quality for better OCR
      base64: false,  // Don't include base64 - we'll read it separately
    });

    if (!imageResult.canceled && imageResult.assets[0]) {
      // Don't set selected image - process directly
      await processImage(imageResult.assets[0]);
    }
  };

  const pickImageFromGallery = async () => {
    const result = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (result.status !== 'granted') {
      Alert.alert('Permission needed', 'Gallery permission is required to select receipts');
      return;
    }

    const imageResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.9,  // Higher quality for better OCR
      base64: false,  // Don't include base64 - we'll read it separately
    });

    if (!imageResult.canceled && imageResult.assets[0]) {
      // Don't set selected image - process directly
      await processImage(imageResult.assets[0]);
    }
  };

  const processImage = async (asset: ImagePicker.ImagePickerAsset) => {
    if (!currentHousehold?.id) {
      Alert.alert('Error', 'No household selected');
      return;
    }

    try {
      setIsProcessing(true);
      setProcessStage('Extracting text from image...');

      // Use Cloud Vision API if available, otherwise mock OCR
      const { CloudVisionService } = await import('../../../services/cloudVisionService');
      const ocrText = await CloudVisionService.extractText(asset.uri);

      // If no text extracted, use mock
      let extractedOcrText = ocrText || generateMockOCR();

      // TEMPORARY: Force new parse by adding timestamp to bypass cache
      extractedOcrText = extractedOcrText + '\n[v11-' + Date.now() + ']';

      setExtractedText(extractedOcrText);
      setProcessStage('Processing receipt data...');

      // Calculate confidence based on text characteristics
      let confidence = 0.85; // Default for mock OCR
      if (ocrText && ocrText !== generateMockOCR()) {
        // Real OCR - estimate confidence based on text quality
        const hasTotal = /total|TOTAL/i.test(ocrText);
        const hasItems = ocrText.split('\n').length > 5;
        const hasPrice = /\$\d+\.\d{2}/.test(ocrText);
        confidence = hasTotal && hasItems && hasPrice ? 0.9 : 0.75;
      }

      // Send to backend
      const result = await receiptService.processReceipt(
        extractedOcrText,
        currentHousehold.id,
        {
          ocrConfidence: confidence,
          useGemini: confidence < 0.75, // Use Gemini for low confidence
        }
      );

      if (result.success) {
        setProcessStage('Success! Redirecting to review...');

        console.log('=== SCANNER RECEIVED RESULT ===');
        console.log('Result object:', JSON.stringify(result, null, 2));
        console.log('Items to pass:', result.items);
        console.log('Items count:', result.items?.length || 0);
        console.log('Receipt to pass:', result.receipt);
        console.log('Parse method:', result.path_taken);

        // Ensure we have items to show
        if (!result.items || result.items.length === 0) {
          console.error('NO ITEMS IN RESULT - something went wrong!');
          Alert.alert('Error', 'No items were parsed from the receipt. Please try again.');
          resetScanner();
          return;
        }

        // Reset scanner state before navigation
        setTimeout(() => {
          console.log('=== NAVIGATING TO FIX QUEUE ===');
          console.log('Passing items:', result.items.length, 'items');
          console.log('Passing receipt:', result.receipt);

          resetScanner(); // Clear the scanner state
          navigation.navigate('FixQueue', {
            items: result.items,
            receipt: result.receipt,
          });
        }, 500);
      } else {
        throw new Error(result.error?.message || 'Processing failed');
      }
    } catch (error: any) {
      console.error('Processing error:', error);

      // Check if it's a network error
      if (error.message?.includes('network') || error.message?.includes('Network')) {
        // Add to offline queue
        await offlineQueueService.addToQueue(
          extractedOcrText || generateMockOCR(),
          currentHousehold.id,
          {
            captureDate: new Date().toISOString(),
            ocrConfidence: 0.85,
          }
        );

        Alert.alert(
          'Saved for Later',
          'Receipt saved offline and will be processed when connection is restored.',
          [
            { text: 'View Queue', onPress: () => navigation.navigate('OfflineQueue') },
            { text: 'OK', onPress: () => resetScanner() }
          ]
        );
      } else {
        Alert.alert(
          'Processing Failed',
          'Could not process the receipt. Please try again.',
          [
            { text: 'Save Offline', onPress: async () => {
              await offlineQueueService.addToQueue(
                extractedText || generateMockOCR(),
                currentHousehold.id,
                {
                  captureDate: new Date().toISOString(),
                  ocr_confidence: 0.85,
                }
              );
              Alert.alert('Saved', 'Receipt saved for later processing');
              resetScanner();
            }},
            { text: 'Try Again', onPress: () => resetScanner() }
          ]
        );
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const generateMockOCR = () => {
    // Generate realistic mock receipt text for testing
    const stores = ['WALMART', 'TARGET', 'KROGER', 'WHOLE FOODS'];
    const store = stores[Math.floor(Math.random() * stores.length)];

    const date = new Date().toLocaleDateString();

    const items = [
      'MILK 2% GAL          $3.99',
      'BREAD WHOLE WHT      $2.49',
      'EGGS LARGE DOZ       $4.99',
      'BANANAS 2.5 LB       $1.87',
      'CHICKEN BREAST       $8.99',
      'CHEESE CHEDDAR       $5.49',
      'YOGURT 4-PACK        $3.99',
      'APPLES GALA 3LB      $4.49',
    ];

    const selectedItems = items.slice(0, 3 + Math.floor(Math.random() * 4));
    const subtotal = selectedItems.reduce((sum, item) => {
      const price = parseFloat(item.match(/\$(\d+\.\d+)/)?.[1] || '0');
      return sum + price;
    }, 0);

    const tax = subtotal * 0.0825;
    const total = subtotal + tax;

    return `${store}
STORE #${Math.floor(Math.random() * 9000) + 1000}
${date}

${selectedItems.join('\n')}

SUBTOTAL         $${subtotal.toFixed(2)}
TAX              $${tax.toFixed(2)}
TOTAL            $${total.toFixed(2)}

THANK YOU FOR SHOPPING`;
  };

  const resetScanner = () => {
    setSelectedImage(null);
    setExtractedText('');
    setProcessStage('');
  };

  if (isProcessing) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.processingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.processingTitle}>Processing Receipt</Text>
          <Text style={styles.processingStage}>{processStage}</Text>

          {extractedText && (
            <View style={styles.extractedPreview}>
              <Text style={styles.extractedTitle}>Extracted Text:</Text>
              <ScrollView style={styles.extractedScroll}>
                <Text style={styles.extractedText}>{extractedText}</Text>
              </ScrollView>
            </View>
          )}
        </View>
      </SafeAreaView>
    );
  }

  if (selectedImage) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.previewContainer}>
          <Image source={{ uri: selectedImage }} style={styles.previewImage} />
          <View style={styles.previewControls}>
            <TouchableOpacity
              style={[styles.previewButton, styles.cancelButton]}
              onPress={resetScanner}
            >
              <Ionicons name="close" size={24} color="#6B7280" />
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.previewButton, styles.processButton]}
              onPress={() => processImage({ uri: selectedImage } as any)}
            >
              <Ionicons name="checkmark" size={24} color="#fff" />
              <Text style={styles.processButtonText}>Process</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Ionicons name="receipt-outline" size={64} color="#3B82F6" />
          <Text style={styles.title}>Scan Receipt</Text>
          <Text style={styles.subtitle}>
            Take a photo or select from gallery to process your receipt
          </Text>
        </View>

        <View style={styles.optionsContainer}>
          <TouchableOpacity
            style={styles.optionCard}
            onPress={pickImageFromCamera}
          >
            <View style={styles.optionIcon}>
              <Ionicons name="camera" size={32} color="#3B82F6" />
            </View>
            <Text style={styles.optionTitle}>Take Photo</Text>
            <Text style={styles.optionDescription}>
              Use camera to capture receipt
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.optionCard}
            onPress={pickImageFromGallery}
          >
            <View style={styles.optionIcon}>
              <Ionicons name="images" size={32} color="#10B981" />
            </View>
            <Text style={styles.optionTitle}>From Gallery</Text>
            <Text style={styles.optionDescription}>
              Select existing receipt photo
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.tipsContainer}>
          <Text style={styles.tipsTitle}>Tips for best results:</Text>
          <View style={styles.tip}>
            <Ionicons name="checkmark-circle" size={20} color="#10B981" />
            <Text style={styles.tipText}>Ensure receipt is flat and well-lit</Text>
          </View>
          <View style={styles.tip}>
            <Ionicons name="checkmark-circle" size={20} color="#10B981" />
            <Text style={styles.tipText}>Include entire receipt in frame</Text>
          </View>
          <View style={styles.tip}>
            <Ionicons name="checkmark-circle" size={20} color="#10B981" />
            <Text style={styles.tipText}>Avoid shadows and glare</Text>
          </View>
        </View>

        {/* Demo Mode Notice - Remove in production */}
        <View style={styles.demoNotice}>
          <Ionicons name="information-circle" size={16} color="#F59E0B" />
          <Text style={styles.demoText}>
            Demo: Using simulated OCR. ML Kit integration pending.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginTop: 40,
    marginBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    marginTop: 16,
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 32,
  },
  optionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 32,
  },
  optionCard: {
    flex: 0.48,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  optionIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  optionDescription: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
  },
  tipsContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
  tipsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
  },
  tip: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  tipText: {
    fontSize: 13,
    color: '#6B7280',
    marginLeft: 8,
    flex: 1,
  },
  processingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  processingTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    marginTop: 16,
  },
  processingStage: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 8,
  },
  extractedPreview: {
    marginTop: 32,
    width: '100%',
    maxHeight: 200,
  },
  extractedTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  extractedScroll: {
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    padding: 12,
  },
  extractedText: {
    fontSize: 12,
    color: '#4B5563',
    fontFamily: 'monospace',
  },
  previewContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  previewImage: {
    flex: 1,
    resizeMode: 'contain',
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
    marginHorizontal: 8,
  },
  cancelButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
  },
  cancelButtonText: {
    color: '#6B7280',
    fontSize: 16,
    fontWeight: '500',
    marginLeft: 4,
  },
  processButton: {
    backgroundColor: '#10B981',
  },
  processButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
    marginLeft: 4,
  },
  demoNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    padding: 12,
    marginTop: 20,
  },
  demoText: {
    fontSize: 12,
    color: '#92400E',
    marginLeft: 8,
    flex: 1,
  },
});