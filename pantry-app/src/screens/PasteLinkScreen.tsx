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
  AppState,
  Clipboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { theme } from '../core/constants/theme';
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
  const [loadingMessage, setLoadingMessage] = useState('Extracting recipe...');
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

      // Set platform-specific loading message
      if (isTraditional) {
        setLoadingMessage('Extracting recipe...');
      } else {
        const platformNames: { [key: string]: string } = {
          instagram: 'Instagram',
          tiktok: 'TikTok',
          youtube: 'YouTube',
          xiaohongshu: 'Xiaohongshu',
        };
        const displayName = platformNames[platform || ''] || 'video';
        setLoadingMessage(`Extracting from ${displayName}...`);
      }

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

      // Replace PasteLinkScreen with CookCardScreen in the stack
      // so back from CookCard goes directly to My Recipes
      navigation.replace('CookCard', {
        cookCard,
        mode: confidence < 0.8 ? 'needs_confirmation' : 'normal',
        sessionId,
      });
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
      setLoadingMessage('Extracting recipe...');
    }
  };

  const handlePasteFromClipboard = async () => {
    try {
      const clipboardContent = await Clipboard.getString();
      if (clipboardContent) {
        setUrl(clipboardContent);
        setError(null);
      }
    } catch (err) {
      console.warn('Failed to paste from clipboard:', err);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header with close button */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.closeButton}
          onPress={() => navigation.goBack()}
          disabled={loading}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="close" size={28} color={theme.colors.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <Text style={styles.title}>Paste Recipe Link</Text>
        <Text style={styles.subtitle}>
          Import from social media or recipe websites
        </Text>

        {/* Input with paste button */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={url}
            onChangeText={(text) => {
              setUrl(text);
              setError(null);
            }}
            placeholder="Paste recipe URL here..."
            placeholderTextColor={theme.colors.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="go"
            onSubmitEditing={handleExtract}
            editable={!loading}
          />
          <TouchableOpacity
            style={styles.pasteButton}
            onPress={handlePasteFromClipboard}
            disabled={loading}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="clipboard-outline" size={22} color={theme.colors.primary} />
          </TouchableOpacity>
        </View>

        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
            {error.includes('look like a recipe link') && (
              <Text style={styles.errorHint}>
                Tip: Open the recipe in the app, tap Share, then Copy Link
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
            <View style={styles.loadingContainer}>
              <ActivityIndicator color="#fff" size="small" />
              <Text style={styles.loadingText}>{loadingMessage}</Text>
            </View>
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
          <View style={styles.helpRow}>
            <Ionicons name="logo-instagram" size={18} color={theme.colors.textSecondary} />
            <Ionicons name="logo-tiktok" size={18} color={theme.colors.textSecondary} style={styles.helpIcon} />
            <Ionicons name="logo-youtube" size={18} color={theme.colors.textSecondary} style={styles.helpIcon} />
            <Text style={styles.helpText}>Instagram, TikTok, YouTube</Text>
          </View>
          <View style={styles.helpRow}>
            <Ionicons name="globe-outline" size={18} color={theme.colors.textSecondary} />
            <Text style={styles.helpText}>NYT Cooking, AllRecipes, and 1000+ more</Text>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
  },
  closeButton: {
    padding: theme.spacing.sm,
  },
  content: {
    flex: 1,
    padding: theme.spacing.lg,
    paddingTop: '20%',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: theme.spacing.sm,
    color: theme.colors.text,
  },
  subtitle: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xl,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    backgroundColor: theme.colors.surface,
    marginBottom: theme.spacing.md,
  },
  input: {
    flex: 1,
    padding: theme.spacing.md,
    fontSize: 16,
    color: theme.colors.text,
  },
  pasteButton: {
    padding: theme.spacing.md,
    borderLeftWidth: 1,
    borderLeftColor: theme.colors.border,
  },
  errorContainer: {
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  errorText: {
    color: '#DC2626',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  errorHint: {
    color: '#DC2626',
    fontSize: 12,
  },
  button: {
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    padding: theme.spacing.md,
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  loadingText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
    marginLeft: theme.spacing.sm,
  },
  cancelButton: {
    padding: theme.spacing.md,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: theme.colors.textSecondary,
    fontSize: 16,
    fontWeight: '500',
  },
  helpContainer: {
    marginTop: theme.spacing.xl,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    gap: theme.spacing.sm,
  },
  helpRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  helpIcon: {
    marginLeft: theme.spacing.sm,
  },
  helpText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginLeft: theme.spacing.sm,
    flex: 1,
  },
});
