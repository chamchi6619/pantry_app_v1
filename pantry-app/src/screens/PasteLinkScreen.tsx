/**
 * PasteLinkScreen - Universal Recipe Import
 *
 * Purpose: Import recipes from ANY source (social media OR traditional recipe websites)
 * Flow:
 * 1. Auto-detect URL type (social vs traditional)
 * 2. Route to appropriate extraction service
 * 3. Navigate to CookCardScreen with extracted data
 *
 * Supported Sources:
 * - Social Media: Instagram, TikTok, YouTube, Xiaohongshu (extract-cook-card Edge Function)
 * - Traditional: NYT Cooking, Bon Appétit, AllRecipes, etc. (ingest-traditional-recipe Edge Function)
 *
 * Cost:
 * - Social media: $0.01-0.02 per recipe (Gemini processing)
 * - Traditional: $0.00 per recipe (schema.org parsing)
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Clipboard,
  Alert,
  AppState,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { validateRecipeURL, detectPlatform } from '../utils/urlUtils';
import { extractCookCard } from '../services/cookCardService';
import {
  ingestTraditionalRecipe,
  loadTraditionalRecipeAsCookCard,
  isTraditionalRecipeUrl,
} from '../services/traditionalRecipeService';
import { saveRecipeWithMatching, updateRecipeWithCanonicalMatching } from '../services/recipeService';
import { logIngressEvent } from '../services/telemetry';
import { supabase } from '../lib/supabase';

/**
 * Universal Recipe Import Flow
 *
 * Flow:
 * 1. User taps "Paste Recipe Link" from home screen
 * 2. Auto-detect clipboard URL, pre-fill input
 * 3. User taps "Extract Recipe" button
 * 4. Detect URL type:
 *    - Social media (Instagram/TikTok/YouTube) → extract-cook-card Edge Function
 *    - Traditional recipe website → ingest-traditional-recipe Edge Function
 * 5. Extract recipe data
 * 6. Navigate to CookCardScreen with extracted data
 *
 * Social Media Extraction:
 * - Cost: $0.01-0.02 per recipe
 * - Uses yt-dlp + Gemini Vision AI
 * - May require confirmation if confidence <80%
 *
 * Traditional Recipe Extraction:
 * - Cost: $0.00 per recipe
 * - Uses schema.org JSON-LD parsing (no AI)
 * - High confidence (95%)
 */

interface PasteLinkScreenProps {
  route?: {
    params?: {
      sessionId?: string; // Passed from share extension if needed
    };
  };
}

export default function PasteLinkScreen({ route }: PasteLinkScreenProps) {
  const navigation = useNavigation();
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionId = route?.params?.sessionId || generateSessionId();
  const lastClipboardCheck = useRef<number>(0);
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    // Auto-fill from clipboard ONLY if:
    // 1. App is in foreground (not spooky background reads)
    // 2. Clipboard was likely changed recently (within last 30 seconds)
    const checkClipboard = async () => {
      try {
        const now = Date.now();
        const timeSinceLastCheck = now - lastClipboardCheck.current;

        // Only check clipboard if app just came to foreground or screen just opened
        if (appState.current !== 'active' || timeSinceLastCheck > 30000) {
          console.log('Skipping clipboard check - app not active or stale clipboard');
          return;
        }

        const clipboardContent = await Clipboard.getString();
        if (clipboardContent && validateRecipeURL(clipboardContent).isValid) {
          setUrl(clipboardContent);
          console.log('Auto-filled from clipboard');
        }

        lastClipboardCheck.current = now;
      } catch (err) {
        console.warn('Failed to read clipboard:', err);
      }
    };

    // Log ingress_opened event
    logIngressEvent({
      sessionId,
      eventType: 'ingress_opened',
      ingressMethod: 'paste_link',
      metadata: { screen: 'PasteLinkScreen' },
    });

    // Track app state changes
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      appState.current = nextAppState;
    });

    // Check clipboard on mount (app is active at this point)
    lastClipboardCheck.current = Date.now();
    checkClipboard();

    return () => {
      subscription.remove();
    };
  }, [sessionId]);

  const handleExtract = async () => {
    if (!url.trim()) {
      setError('Please paste a recipe link');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      // Detect URL type
      const isTraditional = isTraditionalRecipeUrl(url.trim());
      const platform = isTraditional ? 'traditional' : detectPlatform(url.trim());

      console.log('[PasteLink] URL type:', isTraditional ? 'traditional' : 'social', '| Platform:', platform);

      // Log url_pasted event
      logIngressEvent({
        sessionId,
        eventType: 'url_pasted',
        ingressMethod: 'paste_link',
        platform: platform || 'other',
        recipeUrl: url.trim(),
      });

      // Log extraction_started event
      logIngressEvent({
        sessionId,
        eventType: 'extraction_started',
        ingressMethod: 'paste_link',
        platform: platform || 'other',
        recipeUrl: url.trim(),
      });

      let cookCard;
      let extractionMethod;
      let confidence;

      if (isTraditional) {
        // Traditional recipe extraction (schema.org)
        console.log('[PasteLink] Extracting traditional recipe...');

        const result = await ingestTraditionalRecipe({
          url: url.trim(),
          userId: user.id,
          ignoreCache: true, // Always bypass cache (same as social media extraction)
        });

        // Load full Cook Card with ingredients
        cookCard = await loadTraditionalRecipeAsCookCard(result.cook_card.id);
        extractionMethod = 'schema_org';
        confidence = 0.95;

        // Add canonical matching to existing ingredients (for pantry matching)
        console.log('[PasteLink] Adding canonical matching to traditional recipe...');
        await updateRecipeWithCanonicalMatching(result.cook_card.id);

        console.log('[PasteLink] Traditional recipe extracted:', cookCard.title);
      } else {
        // Social media extraction (yt-dlp + Gemini)
        console.log('[PasteLink] Extracting social media recipe...');

        const validation = validateRecipeURL(url.trim());
        if (!validation.isValid) {
          throw new Error(validation.error || 'Invalid recipe URL');
        }

        const result = await extractCookCard(validation.normalizedUrl!, user.id, undefined, true);

        if (!result || !result.cook_card) {
          throw new Error('Invalid extraction response');
        }

        cookCard = result.cook_card;
        extractionMethod = result.extraction?.method || 'l1_oembed';
        confidence = result.extraction?.confidence || 0.99;

        console.log('[PasteLink] Social recipe extracted:', cookCard.title);

        // Save the cook card with canonical matching (for pantry matching)
        if (!cookCard.id) {
          console.log('[PasteLink] Saving social media recipe with canonical matching...');
          const saveResult = await saveRecipeWithMatching(cookCard, user.id);
          cookCard.id = saveResult.id;
          console.log('[PasteLink] Recipe saved with ID:', saveResult.id);
        }
      }

      // Log extraction_completed event
      logIngressEvent({
        sessionId,
        eventType: 'extraction_completed',
        ingressMethod: 'paste_link',
        platform: platform || 'other',
        recipeUrl: url.trim(),
        metadata: {
          extraction_method: extractionMethod,
          confidence: confidence,
          cost_cents: isTraditional ? 0 : 1.5, // Traditional is free!
        },
      });

      // Show success alert and navigate to CookCardScreen
      Alert.alert(
        'Recipe Saved!',
        `"${cookCard.title}" has been added to your recipes.`,
        [
          {
            text: 'View Recipe',
            onPress: () => {
              navigation.navigate('CookCard', {
                cookCard,
                mode: confidence < 0.8 ? 'needs_confirmation' : 'normal',
                sessionId,
              });
            },
          },
        ]
      );
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to extract recipe';
      setError(errorMessage);

      // Log extraction_failed event
      logIngressEvent({
        sessionId,
        eventType: 'extraction_failed',
        ingressMethod: 'paste_link',
        platform: detectPlatform(url.trim()) || 'other',
        recipeUrl: url.trim(),
        errorCode: 'api_error',
        errorMessage,
      });

      console.error('[PasteLink] Extraction failed:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Paste Recipe Link</Text>
        <Text style={styles.subtitle}>
          Paste a link from social media OR traditional recipe websites
        </Text>

        <TextInput
          style={styles.input}
          value={url}
          onChangeText={(text) => {
            setUrl(text);
            setError(null);
          }}
          placeholder="https://www.instagram.com/p/... or cooking.nytimes.com/..."
          placeholderTextColor="#999"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="go"
          onSubmitEditing={handleExtract}
          editable={!loading}
        />

        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
            {error.includes('look like a recipe link') && (
              <Text style={styles.errorHint}>
                Tip: Open the recipe in the app, tap Share → Copy Link, then paste here
              </Text>
            )}
          </View>
        )}

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleExtract}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Extract Recipe</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => navigation.goBack()}
          disabled={loading}
        >
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>

        {/* Help text for supported platforms */}
        <View style={styles.helpContainer}>
          <Text style={styles.helpTitle}>Social Media:</Text>
          <Text style={styles.helpText}>✅ Instagram, TikTok, YouTube, Xiaohongshu</Text>
          <Text style={styles.helpSubtext}>$0.01-0.02 per recipe</Text>

          <Text style={[styles.helpTitle, { marginTop: 12 }]}>Recipe Websites:</Text>
          <Text style={styles.helpText}>✅ NYT Cooking, Bon Appétit, AllRecipes, and 1000+ more</Text>
          <Text style={styles.helpSubtext}>FREE - no AI cost!</Text>
        </View>
      </View>
    </View>
  );
}

function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#000',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 32,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 16,
    fontSize: 16,
    marginBottom: 16,
    backgroundColor: '#f9f9f9',
  },
  errorContainer: {
    backgroundColor: '#fee',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: '#c33',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  errorHint: {
    color: '#c33',
    fontSize: 12,
  },
  button: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButton: {
    padding: 16,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#007AFF',
    fontSize: 16,
  },
  helpContainer: {
    marginTop: 32,
    padding: 16,
    backgroundColor: '#f0f8ff',
    borderRadius: 8,
  },
  helpTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  helpText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  helpSubtext: {
    fontSize: 12,
    color: '#999',
    fontStyle: 'italic',
  },
});
