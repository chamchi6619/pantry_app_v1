import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useSharedURL, isSupportedRecipeURL, getPlatformFromURL } from '../hooks/useSharedURL';
import { extractCookCard } from '../services/cookCardService';
import { CookCard } from '../types/CookCard';
import { CookCardScreen } from './CookCardScreen';

interface ShareHandlerScreenProps {
  userId: string;
  householdId?: string;
  onComplete?: () => void;
}

/**
 * ShareHandlerScreen Component
 *
 * Purpose: Handle incoming shared URLs and extract Cook Cards
 * Flow:
 * 1. Detect shared URL from share extension
 * 2. Validate URL is from supported platform
 * 3. Call extract-cook-card Edge Function
 * 4. Show CookCardScreen with extracted data
 * 5. Allow user to save or discard
 *
 * PRD Reference: COOKCARD_PRD_V1.md Task 2.1, 2.2
 */
export const ShareHandlerScreen: React.FC<ShareHandlerScreenProps> = ({
  userId,
  householdId,
  onComplete,
}) => {
  const { sharedURL, isLoading: urlLoading, error: urlError, clearSharedURL } = useSharedURL();
  const [extracting, setExtracting] = useState(false);
  const [cookCard, setCookCard] = useState<CookCard | null>(null);
  const [requiresConfirmation, setRequiresConfirmation] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sharedURL && !urlLoading) {
      handleSharedURL(sharedURL);
    }
  }, [sharedURL, urlLoading]);

  /**
   * Handle incoming shared URL
   */
  const handleSharedURL = async (url: string) => {
    try {
      setExtracting(true);
      setError(null);

      // Validate URL is supported
      if (!isSupportedRecipeURL(url)) {
        const platform = getPlatformFromURL(url);
        Alert.alert(
          'Unsupported Platform',
          `We don't support recipes from ${platform} yet. Supported platforms: Instagram, TikTok, YouTube, Xiaohongshu.`,
          [{ text: 'OK', onPress: handleCancel }]
        );
        return;
      }

      // Extract Cook Card
      console.log('🔍 Extracting Cook Card from:', url);
      // TODO: Make bypass_cache conditional (e.g., dev mode only)
      const result = await extractCookCard(url, userId, householdId, true);

      setCookCard(result.cook_card);
      setRequiresConfirmation(result.requires_confirmation);

      // Show confirmation alert if extraction confidence is low
      if (result.requires_confirmation) {
        Alert.alert(
          'Please Confirm Ingredients',
          `We extracted ${result.cook_card.ingredients.length} ingredients with ${Math.round(result.cook_card.extraction.confidence * 100)}% confidence. Please review before saving.`,
          [{ text: 'OK' }]
        );
      }
    } catch (err) {
      console.error('Extraction error:', err);
      setError(err instanceof Error ? err.message : 'Failed to extract recipe');

      Alert.alert(
        'Extraction Failed',
        'Could not extract ingredients from this URL. The post may not contain a recipe, or the creator may not have listed ingredients.',
        [
          { text: 'Cancel', style: 'cancel', onPress: handleCancel },
          { text: 'Try Again', onPress: () => handleSharedURL(url) },
        ]
      );
    } finally {
      setExtracting(false);
    }
  };

  /**
   * Handle save button press
   */
  const handleSave = async () => {
    if (!cookCard) return;

    try {
      // TODO: Implement save to database
      console.log('✅ Saving Cook Card:', cookCard.title);

      Alert.alert(
        'Recipe Saved!',
        `${cookCard.title} has been added to your saved recipes.`,
        [{ text: 'OK', onPress: handleComplete }]
      );
    } catch (err) {
      console.error('Save error:', err);
      Alert.alert('Error', 'Could not save recipe. Please try again.');
    }
  };

  /**
   * Handle cook button press
   */
  const handleCook = () => {
    if (!cookCard) return;

    // TODO: Navigate to cook session screen
    console.log('🍳 Starting cook session for:', cookCard.title);
    Alert.alert('Coming Soon', 'Cook session feature will be available in Week 5-6.');
  };

  /**
   * Handle add to shopping list
   */
  const handleAddToShoppingList = () => {
    if (!cookCard) return;

    // TODO: Implement shopping list addition
    console.log('🛒 Adding ingredients to shopping list');
    Alert.alert('Coming Soon', 'Shopping list feature will be available in Week 5-6.');
  };

  /**
   * Handle cancel
   */
  const handleCancel = () => {
    clearSharedURL();
    setCookCard(null);
    setError(null);
    if (onComplete) onComplete();
  };

  /**
   * Handle completion
   */
  const handleComplete = () => {
    clearSharedURL();
    setCookCard(null);
    setError(null);
    if (onComplete) onComplete();
  };

  // Loading state
  if (urlLoading || extracting) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#10B981" />
        <Text style={styles.loadingText}>
          {extracting ? 'Extracting recipe...' : 'Processing share...'}
        </Text>
        <Text style={styles.loadingSubtext}>
          This usually takes 1-2 seconds
        </Text>
      </View>
    );
  }

  // Error state
  if (error || urlError) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorIcon}>⚠️</Text>
        <Text style={styles.errorTitle}>Could Not Load Recipe</Text>
        <Text style={styles.errorMessage}>{error || urlError}</Text>
      </View>
    );
  }

  // No shared URL
  if (!sharedURL && !cookCard) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyIcon}>📱</Text>
        <Text style={styles.emptyTitle}>No Recipe Shared</Text>
        <Text style={styles.emptyMessage}>
          Share a recipe from Instagram, TikTok, YouTube, or Xiaohongshu to get started.
        </Text>
      </View>
    );
  }

  // Show Cook Card
  if (cookCard) {
    return (
      <CookCardScreen
        cookCard={cookCard}
        onSave={handleSave}
        onCook={handleCook}
        onAddToShoppingList={requiresConfirmation ? undefined : handleAddToShoppingList}
      />
    );
  }

  return null;
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 24,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  loadingSubtext: {
    marginTop: 8,
    fontSize: 14,
    color: '#6B7280',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 24,
  },
  errorIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 24,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  emptyMessage: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
});
