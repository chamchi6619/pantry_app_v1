/**
 * ExtractMealModal
 *
 * Purpose: Upgrade text-only meals to extracted cook cards with pantry matching
 * Features:
 *   - URL input (pre-filled if source_url exists)
 *   - Shows extraction benefits (pantry match, shopping list, etc.)
 *   - Calls extract-cook-card Edge Function
 *   - Links meal to new cook_card
 *   - Shows quota information (for freemium gate)
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../../core/constants/theme';
import type { PlannedMeal } from '../../../services/mealPlanningService';
import { extractCookCard, saveCookCard } from '../../../services/cookCardService';
import { linkMealToCookCard } from '../../../services/mealPlanningService';

interface ExtractMealModalProps {
  visible: boolean;
  meal: PlannedMeal | null;
  userId: string;
  householdId: string;
  onClose: () => void;
  onExtracted: () => void;
}

export default function ExtractMealModal({
  visible,
  meal,
  userId,
  householdId,
  onClose,
  onExtracted,
}: ExtractMealModalProps) {
  const [url, setUrl] = useState('');
  const [extracting, setExtracting] = useState(false);

  // Pre-fill URL from meal if exists
  useEffect(() => {
    if (meal?.source_url) {
      setUrl(meal.source_url);
    } else {
      setUrl('');
    }
  }, [meal]);

  const handleExtract = async () => {
    if (!meal) return;

    if (!url.trim()) {
      Alert.alert('Missing URL', 'Please enter a recipe URL (Instagram, TikTok, YouTube, etc.)');
      return;
    }

    // Basic URL validation
    try {
      new URL(url);
    } catch {
      Alert.alert('Invalid URL', 'Please enter a valid URL starting with http:// or https://');
      return;
    }

    setExtracting(true);
    try {
      console.log('[ExtractMeal] Starting extraction...', { url, mealId: meal.id });

      // Step 1: Extract cook card from URL
      const extractionResult = await extractCookCard(url, userId, householdId);

      console.log('[ExtractMeal] Extraction complete:', extractionResult.cook_card.title);

      // Step 2: Save cook card to database
      const { id: cookCardId } = await saveCookCard(
        extractionResult.cook_card,
        userId,
        householdId
      );

      console.log('[ExtractMeal] Cook card saved:', cookCardId);

      // Step 3: Link meal to cook_card (includes pantry match calculation)
      await linkMealToCookCard(meal.id, cookCardId, householdId);

      console.log('[ExtractMeal] Meal linked to cook card');

      // Success!
      Alert.alert(
        'Recipe Extracted!',
        `"${extractionResult.cook_card.title}" has been extracted. Check your meal plan to see the pantry match!`,
        [{ text: 'OK', onPress: () => {
          onClose();
          onExtracted();
        }}]
      );
    } catch (error: any) {
      console.error('[ExtractMeal] Extraction failed:', error);

      // Handle specific error cases
      let errorMessage = 'Failed to extract recipe. Please try again.';

      if (error.message?.includes('quota')) {
        errorMessage = 'You\'ve used all your extractions this month. Upgrade to Premium for unlimited extractions!';
      } else if (error.message?.includes('unsupported')) {
        errorMessage = 'This URL is not supported yet. Try Instagram, TikTok, or YouTube links.';
      } else if (error.message?.includes('network')) {
        errorMessage = 'Network error. Please check your internet connection.';
      } else if (error.message) {
        errorMessage = error.message;
      }

      Alert.alert('Extraction Failed', errorMessage);
    } finally {
      setExtracting(false);
    }
  };

  if (!meal) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Extract Recipe</Text>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={theme.colors.text} />
            </Pressable>
          </View>

          <ScrollView style={styles.content}>
            {/* Benefits Section */}
            <View style={styles.benefitsSection}>
              <Text style={styles.benefitsTitle}>🎯 Unlock Smart Features</Text>
              <View style={styles.benefitsList}>
                <View style={styles.benefitItem}>
                  <Ionicons name="checkmark-circle" size={20} color={theme.colors.success} />
                  <Text style={styles.benefitText}>See pantry match percentage</Text>
                </View>
                <View style={styles.benefitItem}>
                  <Ionicons name="checkmark-circle" size={20} color={theme.colors.success} />
                  <Text style={styles.benefitText}>View missing ingredients</Text>
                </View>
                <View style={styles.benefitItem}>
                  <Ionicons name="checkmark-circle" size={20} color={theme.colors.success} />
                  <Text style={styles.benefitText}>Auto-generate shopping list</Text>
                </View>
                <View style={styles.benefitItem}>
                  <Ionicons name="checkmark-circle" size={20} color={theme.colors.success} />
                  <Text style={styles.benefitText}>Full recipe details & instructions</Text>
                </View>
              </View>
            </View>

            {/* URL Input */}
            <View style={styles.section}>
              <Text style={styles.label}>
                Recipe URL <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={styles.input}
                placeholder="https://instagram.com/reel/..."
                placeholderTextColor={theme.colors.textSecondary}
                value={url}
                onChangeText={setUrl}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                autoFocus={!meal.source_url}
                editable={!extracting}
              />
              <Text style={styles.hint}>
                💡 Paste a link from Instagram, TikTok, YouTube, or other recipe sites
              </Text>
            </View>

            {/* Supported Platforms */}
            <View style={styles.platformsSection}>
              <Text style={styles.platformsTitle}>Supported Platforms:</Text>
              <View style={styles.platformsList}>
                <View style={styles.platformChip}>
                  <Text style={styles.platformText}>📷 Instagram</Text>
                </View>
                <View style={styles.platformChip}>
                  <Text style={styles.platformText}>🎵 TikTok</Text>
                </View>
                <View style={styles.platformChip}>
                  <Text style={styles.platformText}>▶️ YouTube</Text>
                </View>
                <View style={styles.platformChip}>
                  <Text style={styles.platformText}>📝 Blogs</Text>
                </View>
              </View>
            </View>

            {/* Info Box */}
            <View style={styles.infoBox}>
              <Ionicons name="information-circle-outline" size={20} color={theme.colors.primary} />
              <Text style={styles.infoText}>
                Extraction uses AI to analyze the recipe and extract ingredients, instructions, and images. This may take 10-30 seconds.
              </Text>
            </View>
          </ScrollView>

          {/* Footer Actions */}
          <View style={styles.footer}>
            <Pressable
              style={[styles.button, styles.cancelButton]}
              onPress={onClose}
              disabled={extracting}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>

            <Pressable
              style={[styles.button, styles.extractButton, extracting && styles.extractButtonDisabled]}
              onPress={handleExtract}
              disabled={extracting || !url.trim()}
            >
              {extracting ? (
                <>
                  <ActivityIndicator size="small" color="#fff" />
                  <Text style={styles.extractButtonText}>Extracting...</Text>
                </>
              ) : (
                <>
                  <Ionicons name="arrow-up-circle" size={20} color="#fff" />
                  <Text style={styles.extractButtonText}>Extract Recipe</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: theme.colors.text,
  },
  closeButton: {
    padding: theme.spacing.xs,
  },
  content: {
    padding: theme.spacing.md,
  },

  // Benefits Section
  benefitsSection: {
    backgroundColor: '#F0F9FF',
    padding: theme.spacing.md,
    borderRadius: 12,
    marginBottom: theme.spacing.lg,
  },
  benefitsTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.sm,
  },
  benefitsList: {
    gap: theme.spacing.sm,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  benefitText: {
    fontSize: 15,
    color: theme.colors.textPrimary,
  },

  // Form Section
  section: {
    marginBottom: theme.spacing.lg,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  required: {
    color: theme.colors.error,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    padding: theme.spacing.sm + 4,
    fontSize: 16,
    color: theme.colors.text,
    backgroundColor: '#F9FAFB',
  },
  hint: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
  },

  // Platforms Section
  platformsSection: {
    marginBottom: theme.spacing.lg,
  },
  platformsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  platformsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  platformChip: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: 16,
  },
  platformText: {
    fontSize: 13,
    color: theme.colors.textPrimary,
  },

  // Info Box
  infoBox: {
    flexDirection: 'row',
    padding: theme.spacing.sm,
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
    marginTop: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: theme.colors.textSecondary,
    lineHeight: 18,
  },

  // Footer
  footer: {
    flexDirection: 'row',
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.sm + 4,
    borderRadius: 8,
    gap: theme.spacing.xs,
  },
  cancelButton: {
    backgroundColor: '#F3F4F6',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
  },
  extractButton: {
    backgroundColor: theme.colors.primary,
  },
  extractButtonDisabled: {
    opacity: 0.5,
  },
  extractButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
});
