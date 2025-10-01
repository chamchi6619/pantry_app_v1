/**
 * Test OCR Screen
 * For testing receipt scanning via Expo Go
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
  Switch,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { backendOCR } from '../services/backendOcrService';
import { realOCR } from '../services/realOcrService';
import { useNavigation } from '@react-navigation/native';
import { useInventorySupabaseStore } from '../stores/inventorySupabaseStore';
import { useReceiptSupabaseStore } from '../stores/receiptSupabaseStore';
import { useAuth } from '../contexts/AuthContext';
import { FEATURE_FLAGS } from '../config/featureFlags';

export function TestOCRScreen() {
  const navigation = useNavigation();
  const { householdId } = useAuth();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocrUsage, setOcrUsage] = useState({ used: 0, limit: 900, remaining: 900 });
  const [useGemini, setUseGemini] = useState(false);

  // Use stores for direct inventory addition
  const { addItem: addToInventory } = useInventorySupabaseStore();
  const { processOCRResult, initialize: initializeReceipts } = useReceiptSupabaseStore();

  // Initialize receipt store
  React.useEffect(() => {
    if (householdId) {
      initializeReceipts(householdId);
    }
  }, [householdId, initializeReceipts]);

  // Test backend connection
  const testConnection = async () => {
    const connected = await realOCR.testConnection();
    const usage = realOCR.getUsageStats();
    setOcrUsage(usage);
    Alert.alert(
      'Connection Test',
      connected
        ? `✅ Backend connected!\n\nOCR Usage: ${usage.used}/${usage.limit}\n${usage.remaining} scans remaining`
        : '❌ Backend connection failed'
    );
  };

  // Pick image from gallery
  const pickImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permissionResult.granted) {
      Alert.alert('Permission needed', 'Please grant camera roll permissions');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 1,
    });

    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
      setResult(null);
      setError(null);
    }
  };

  // Take photo with camera
  const takePhoto = async () => {
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();

    if (!permissionResult.granted) {
      Alert.alert('Permission needed', 'Please grant camera permissions');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: false,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
      setResult(null);
      setError(null);
    }
  };

  // Process the image with real OCR
  const processImage = async () => {
    if (!imageUri) {
      Alert.alert('No image', 'Please select or take a photo first');
      return;
    }

    setProcessing(true);
    setError(null);

    try {
      // Use real OCR service instead of mock
      const ocrResult = await realOCR.processReceiptWithOCR(imageUri, {
        household_id: 'test_household',
        user_id: 'test_user',
        use_gemini: useGemini,
      });

      setResult(ocrResult);
      console.log('Real OCR Result:', JSON.stringify(ocrResult, null, 2));

      // Update usage stats
      const usage = realOCR.getUsageStats();
      setOcrUsage(usage);

      // Show OCR text length in console
      if (ocrResult.ocr_text_length) {
        console.log(`OCR extracted ${ocrResult.ocr_text_length} characters`);
      }

    } catch (err: any) {
      setError(err.message || 'OCR processing failed');
      Alert.alert('Error', err.message || 'OCR processing failed');
    } finally {
      setProcessing(false);
    }
  };

  // Navigate to Fix Queue
  const navigateToFixQueue = () => {
    if (!result) return;

    // Only send items that need review to Fix Queue
    const itemsNeedingReview = result.fix_queue_items || [];

    // If no items need review, go straight to inventory
    if (itemsNeedingReview.length === 0 && result.line_items.length > 0) {
      Alert.alert(
        'All items recognized!',
        'All items were successfully recognized. Add them to inventory?',
        [
          { text: 'Review anyway', onPress: () => proceedToFixQueue() },
          { text: 'Add to inventory', onPress: () => addDirectlyToInventory() },
        ]
      );
      return;
    }

    proceedToFixQueue();
  };

  const proceedToFixQueue = () => {
    if (!result) return;

    // Only include items that need review
    const itemsForReview = result.fix_queue_items.map((item: any, index: number) => ({
      id: `fix-item-${Date.now()}-${index}`, // Unique ID with timestamp
      rawText: item.raw_text || '',
      name: item.parsed_name || item.raw_text || '',
      displayName: item.normalized_name || item.parsed_name, // Show normalized name in UI
      quantity: item.quantity || 1,
      unit: item.unit || 'pcs',
      price: item.price || 0,
      category: item.category,
      confidence: item.confidence || 0,
      needsReview: true,
      location: undefined, // User will set this
    }));

    const receiptData = {
      id: result.receipt_id,
      storeName: result.merchant || 'Unknown Store',
      date: result.date || new Date().toISOString(),
      total: result.total || 0,
      currency: 'USD',
      items: itemsForReview,
      recognizedItems: result.line_items, // Pass recognized items separately
    };

    navigation.navigate('ReceiptFixQueue' as never, {
      receiptData,
      imageUri,
      ocrConfidence: result.confidence,
    } as never);
  };

  // Add items directly to inventory (when all items are recognized)
  const addDirectlyToInventory = async () => {
    if (!result) return;

    // Add recognized items to inventory
    for (const item of result.line_items) {
      await addToInventory({
        name: item.normalized_name || item.parsed_name || item.item_name,
        quantity: item.quantity || 1,
        unit: item.unit || 'pcs',
        category: item.category || 'Other',
        location: 'pantry', // Default location, user can change later
        notes: `From ${result.merchant || 'receipt'} on ${result.date || 'today'}`,
        normalized: (item.normalized_name || item.parsed_name || item.item_name).toLowerCase().replace(/[^a-z0-9]/g, ''),
      });
    }

    // Save receipt using processOCRResult
    await processOCRResult({
      date: result.date,
      storeName: result.merchant,
      total: result.total,
      currency: 'USD',
      confidence: result.confidence,
      recognizedItems: result.line_items.map((item: any) => ({
        name: item.normalized_name || item.parsed_name || item.item_name,
        quantity: item.quantity || 1,
        unit: item.unit || 'pcs',
        price: item.price,
        category: item.category,
      })),
      uncertainItems: [],
    }, imageUri);

    Alert.alert(
      'Success!',
      `Added ${result.line_items.length} items to inventory`,
      [{ text: 'View Inventory', onPress: () => navigation.navigate('Inventory' as never) }]
    );
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Test Receipt OCR</Text>
        <View style={styles.usageContainer}>
          <Text style={styles.usageText}>
            OCR Usage: {ocrUsage.used}/{ocrUsage.limit}
          </Text>
          {ocrUsage.remaining <= 100 && (
            <Text style={styles.warningText}>
              ⚠️ Only {ocrUsage.remaining} scans left!
            </Text>
          )}
        </View>
        <TouchableOpacity
          style={styles.connectionButton}
          onPress={testConnection}
        >
          <Text style={styles.buttonText}>Test Connection</Text>
        </TouchableOpacity>
      </View>

      {/* Gemini toggle */}
      <View style={styles.toggleContainer}>
        <Text style={styles.toggleLabel}>Use Gemini AI Parser</Text>
        <Switch
          value={useGemini}
          onValueChange={setUseGemini}
          trackColor={{ false: '#E5E7EB', true: '#10B981' }}
          thumbColor={useGemini ? '#fff' : '#f4f3f4'}
        />
        {useGemini && (
          <Text style={styles.toggleNote}>
            Will use AI for better accuracy (costs ~$0.00004)
          </Text>
        )}
      </View>

      {/* Image selection */}
      <View style={styles.buttonRow}>
        <TouchableOpacity style={styles.button} onPress={pickImage}>
          <Text style={styles.buttonText}>📷 Gallery</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={takePhoto}>
          <Text style={styles.buttonText}>📸 Camera</Text>
        </TouchableOpacity>
      </View>

      {/* Image preview */}
      {imageUri && (
        <View style={styles.imageContainer}>
          <Image source={{ uri: imageUri }} style={styles.image} />
          <TouchableOpacity
            style={[styles.processButton, processing && styles.buttonDisabled]}
            onPress={processImage}
            disabled={processing}
          >
            {processing ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.processButtonText}>Process Receipt</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Error display */}
      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>❌ {error}</Text>
        </View>
      )}

      {/* Results display */}
      {result && (
        <View style={styles.resultsContainer}>
          <Text style={styles.sectionTitle}>📋 Receipt Info</Text>

          <View style={styles.infoRow}>
            <Text style={styles.label}>Merchant:</Text>
            <Text style={styles.value}>{result.merchant || 'Not detected'}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.label}>Date:</Text>
            <Text style={styles.value}>{result.date || 'Not detected'}</Text>
          </View>

          {result.subtotal && (
            <View style={styles.infoRow}>
              <Text style={styles.label}>Subtotal:</Text>
              <Text style={styles.value}>${result.subtotal.toFixed(2)}</Text>
            </View>
          )}

          {result.tax && (
            <View style={styles.infoRow}>
              <Text style={styles.label}>Tax:</Text>
              <Text style={styles.value}>${result.tax.toFixed(2)}</Text>
            </View>
          )}

          <View style={styles.infoRow}>
            <Text style={styles.label}>Total:</Text>
            <Text style={styles.value}>
              ${result.total?.toFixed(2) || 'Not detected'}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.label}>Confidence:</Text>
            <Text style={styles.value}>
              {(result.confidence * 100).toFixed(0)}%
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.label}>Source:</Text>
            <Text style={styles.value}>{result.source}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.label}>Processing Time:</Text>
            <Text style={styles.value}>{result.processing_time_ms}ms</Text>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionButtonsContainer}>
            <TouchableOpacity
              style={styles.reviewButton}
              onPress={navigateToFixQueue}
            >
              <Text style={styles.reviewButtonText}>
                {result.fix_queue_items.length > 0
                  ? `📝 Review ${result.fix_queue_items.length} Items & Add All`
                  : '✅ Add All to Inventory'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Items Summary */}
          {(result.line_items.length > 0 || result.fix_queue_items.length > 0) && (
            <View style={styles.itemsSummary}>
              <Text style={styles.summaryLabel}>Items Total:</Text>
              <Text style={styles.summaryValue}>
                ${[...result.line_items, ...result.fix_queue_items]
                  .reduce((sum, item) => sum + (item.price || 0), 0)
                  .toFixed(2)}
              </Text>
              {result.subtotal && (
                <Text style={styles.summaryNote}>
                  {Math.abs(
                    result.subtotal -
                    [...result.line_items, ...result.fix_queue_items]
                      .reduce((sum, item) => sum + (item.price || 0), 0)
                  ) > 0.10 &&
                    '(Some items may be filtered: bags, fees, deposits)'}
                </Text>
              )}
            </View>
          )}

          {/* Line items */}
          {result.line_items.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>✅ Recognized Items</Text>
              {result.line_items.map((item: any, index: number) => (
                <View key={`line-${index}`} style={styles.itemCard}>
                  <Text style={styles.itemName}>
                    {item.normalized_name || item.parsed_name}
                  </Text>
                  {item.normalized_name && item.normalized_name !== item.parsed_name && (
                    <Text style={styles.originalName}>({item.parsed_name})</Text>
                  )}
                  <View style={styles.itemDetails}>
                    <Text style={styles.itemDetail}>
                      {item.quantity} {item.unit}
                    </Text>
                    {item.price && (
                      <Text style={styles.itemDetail}>${item.price.toFixed(2)}</Text>
                    )}
                    {item.category && (
                      <Text style={styles.itemCategory}>{item.category}</Text>
                    )}
                  </View>
                  <Text style={styles.itemConfidence}>
                    Confidence: {(item.confidence * 100).toFixed(0)}%
                  </Text>
                </View>
              ))}
            </>
          )}

          {/* Fix queue items */}
          {result.fix_queue_items.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>⚠️ Needs Review</Text>
              {result.fix_queue_items.map((item: any, index: number) => (
                <View key={`fix-${index}`} style={[styles.itemCard, styles.needsReview]}>
                  <Text style={styles.rawText}>{item.raw_text}</Text>
                  <Text style={styles.itemName}>
                    {item.normalized_name || item.parsed_name || 'Unable to parse'}
                  </Text>
                  {item.normalized_name && item.normalized_name !== item.parsed_name && (
                    <Text style={styles.originalName}>({item.parsed_name})</Text>
                  )}
                  {item.price && (
                    <Text style={styles.itemDetail}>${item.price.toFixed(2)}</Text>
                  )}
                  <Text style={styles.itemConfidence}>
                    Confidence: {(item.confidence * 100).toFixed(0)}%
                  </Text>
                </View>
              ))}
            </>
          )}

          {/* Debug info */}
          {__DEV__ && result.debug_info && (
            <>
              <Text style={styles.sectionTitle}>🐛 Debug Info</Text>
              <View style={styles.debugContainer}>
                {result.debug_info.gemini_cost > 0 && (
                  <Text style={styles.debugCost}>
                    💰 Gemini cost: ${result.debug_info.gemini_cost.toFixed(6)} ({(result.debug_info.gemini_cost * 100).toFixed(4)}¢)
                  </Text>
                )}
                {result.debug_info.processing_notes && (
                  <Text style={styles.debugNotes}>
                    📝 Notes: {result.debug_info.processing_notes}
                  </Text>
                )}
                <Text style={styles.debugText}>
                  {JSON.stringify(result.debug_info, null, 2)}
                </Text>
              </View>
            </>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    padding: 20,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  connectionButton: {
    backgroundColor: '#4CAF50',
    padding: 10,
    borderRadius: 5,
    alignSelf: 'flex-start',
  },
  usageContainer: {
    marginVertical: 10,
  },
  usageText: {
    fontSize: 14,
    color: '#666',
  },
  warningText: {
    fontSize: 14,
    color: '#FF9800',
    fontWeight: 'bold',
  },
  toggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: 'white',
    marginVertical: 5,
  },
  toggleLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
  },
  toggleNote: {
    position: 'absolute',
    bottom: -18,
    left: 20,
    fontSize: 12,
    color: '#666',
  },
  buttonRow: {
    flexDirection: 'row',
    padding: 20,
    gap: 10,
  },
  button: {
    flex: 1,
    backgroundColor: '#2196F3',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  imageContainer: {
    margin: 20,
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  image: {
    width: '100%',
    height: 300,
    borderRadius: 8,
    marginBottom: 10,
  },
  processButton: {
    backgroundColor: '#10B981',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  processButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 18,
  },
  errorContainer: {
    margin: 20,
    padding: 15,
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  errorText: {
    color: '#DC2626',
    fontSize: 14,
  },
  resultsContainer: {
    margin: 20,
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 15,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 15,
    marginBottom: 10,
  },
  infoRow: {
    flexDirection: 'row',
    paddingVertical: 5,
  },
  label: {
    width: 120,
    fontWeight: '600',
    color: '#666',
  },
  value: {
    flex: 1,
    color: '#333',
  },
  itemCard: {
    backgroundColor: '#F9FAFB',
    padding: 12,
    borderRadius: 6,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  needsReview: {
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
  },
  rawText: {
    fontSize: 11,
    color: '#999',
    marginBottom: 4,
  },
  itemName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  itemDetails: {
    flexDirection: 'row',
    gap: 15,
  },
  itemDetail: {
    fontSize: 14,
    color: '#666',
  },
  itemCategory: {
    fontSize: 14,
    color: '#10B981',
    fontStyle: 'italic',
  },
  itemConfidence: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  debugContainer: {
    backgroundColor: '#F3F4F6',
    padding: 10,
    borderRadius: 6,
  },
  debugCost: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#10B981',
    marginBottom: 5,
  },
  debugNotes: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
  },
  debugText: {
    fontSize: 10,
    fontFamily: 'monospace',
    color: '#666',
  },
  actionButtonsContainer: {
    marginVertical: 15,
    paddingHorizontal: 15,
  },
  reviewButton: {
    backgroundColor: '#10B981',
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  reviewButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  originalName: {
    fontSize: 12,
    color: '#999',
    fontStyle: 'italic',
    marginTop: 2,
  },
  itemsSummary: {
    backgroundColor: '#F3F4F6',
    padding: 12,
    marginVertical: 10,
    borderRadius: 8,
  },
  summaryLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
    marginTop: 4,
  },
  summaryNote: {
    fontSize: 12,
    color: '#6B7280',
    fontStyle: 'italic',
    marginTop: 4,
  },
});