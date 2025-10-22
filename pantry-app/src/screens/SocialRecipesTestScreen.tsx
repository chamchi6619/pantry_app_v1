/**
 * 🧪 DEV-ONLY: Social Recipes Test Screen
 *
 * Purpose: Test extraction implementation with real social media URLs
 * Status: Development/debugging tool only
 *
 * Features:
 * - Quick test URLs (YouTube with Schema.org, standard, Instagram, TikTok)
 * - Custom URL input
 * - Extraction result display with provenance tracking
 * - Confidence visualization
 * - Source breakdown (schema_org, html_description, opengraph, etc.)
 *
 * ACCESS: Flask icon button in Recipes header (dev mode only)
 * TODO: Remove from production builds or hide behind feature flag
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface ExtractionResult {
  success: boolean;
  cook_card?: any;
  error?: string;
  extraction_time_ms?: number;
}

// No fixed test URLs - users paste real URLs from clipboard

export const SocialRecipesTestScreen: React.FC = () => {
  const { session, householdId } = useAuth();
  const [customUrl, setCustomUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ExtractionResult | null>(null);

  const handleExtractUrl = async (url: string) => {
    if (!url || url.trim().length === 0) {
      Alert.alert('Error', 'Please enter a valid URL');
      return;
    }

    if (!session?.user?.id) {
      Alert.alert('Error', 'You must be logged in to test extraction');
      return;
    }

    setLoading(true);
    setResult(null);

    const startTime = Date.now();

    try {
      console.log('🧪 Testing extraction for URL:', url);

      // Call extract-cook-card Edge Function
      const { data, error } = await supabase.functions.invoke('extract-cook-card', {
        body: {
          url: url.trim(),
          user_id: session.user.id,
          household_id: householdId || undefined,
        },
      });

      const extractionTime = Date.now() - startTime;

      if (error) {
        throw new Error(error.message || 'Extraction failed');
      }

      console.log('✅ Extraction result:', data);

      setResult({
        success: true,
        cook_card: data.cook_card,
        extraction_time_ms: extractionTime,
      });

      Alert.alert(
        'Extraction Complete',
        `Extracted in ${(extractionTime / 1000).toFixed(2)}s\n` +
          `Ingredients: ${data.cook_card?.ingredients?.length || 0}\n` +
          `Confidence: ${(data.cook_card?.extraction?.confidence * 100).toFixed(0)}%\n` +
          `Sources: ${data.cook_card?.extraction?.sources?.join(', ') || 'Unknown'}`
      );
    } catch (error) {
      console.error('❌ Extraction error:', error);
      setResult({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        extraction_time_ms: Date.now() - startTime,
      });

      Alert.alert('Extraction Failed', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  // No test buttons - users paste URLs directly

  const renderExtractionResult = () => {
    if (!result) return null;

    if (!result.success) {
      return (
        <View style={styles.resultContainer}>
          <View style={styles.resultHeader}>
            <Ionicons name="close-circle" size={32} color="#EF4444" />
            <Text style={styles.resultTitle}>Extraction Failed</Text>
          </View>
          <Text style={styles.errorText}>{result.error}</Text>
          <Text style={styles.timeText}>
            Time: {((result.extraction_time_ms || 0) / 1000).toFixed(2)}s
          </Text>
        </View>
      );
    }

    const cookCard = result.cook_card;
    const extraction = cookCard?.extraction;
    const sources = extraction?.sources || [];
    const confidence = extraction?.confidence || 0;

    return (
      <View style={styles.resultContainer}>
        {/* Header */}
        <View style={styles.resultHeader}>
          <Ionicons name="checkmark-circle" size={32} color="#10B981" />
          <Text style={styles.resultTitle}>Extraction Successful</Text>
        </View>

        {/* Metadata */}
        <View style={styles.metadataSection}>
          <Text style={styles.sectionTitle}>📊 Extraction Metadata</Text>
          <View style={styles.metadataRow}>
            <Text style={styles.metadataLabel}>Time:</Text>
            <Text style={styles.metadataValue}>
              {((result.extraction_time_ms || 0) / 1000).toFixed(2)}s
            </Text>
          </View>
          <View style={styles.metadataRow}>
            <Text style={styles.metadataLabel}>Method:</Text>
            <Text style={styles.metadataValue}>{extraction?.method || 'Unknown'}</Text>
          </View>
          <View style={styles.metadataRow}>
            <Text style={styles.metadataLabel}>Confidence:</Text>
            <View style={styles.confidenceContainer}>
              <View style={styles.confidenceBar}>
                <View style={[styles.confidenceFill, { width: `${confidence * 100}%` }]} />
              </View>
              <Text style={styles.confidenceText}>{(confidence * 100).toFixed(0)}%</Text>
            </View>
          </View>
          <View style={styles.metadataRow}>
            <Text style={styles.metadataLabel}>Cost:</Text>
            <Text style={styles.metadataValue}>${((extraction?.cost_cents || 0) / 100).toFixed(3)}</Text>
          </View>
          {/* yt-dlp info */}
          {cookCard?.description && (
            <View style={styles.metadataRow}>
              <Text style={styles.metadataLabel}>Description:</Text>
              <Text style={styles.metadataValue}>{cookCard.description.length} chars</Text>
            </View>
          )}
        </View>

        {/* Sources Breakdown */}
        {sources.length > 0 && (
          <View style={styles.sourcesSection}>
            <Text style={styles.sectionTitle}>🔍 Extraction Sources</Text>
            {sources.map((source: string, index: number) => (
              <View key={index} style={styles.sourceItem}>
                <Ionicons
                  name={
                    source.includes('schema')
                      ? 'code-outline'
                      : source.includes('html')
                      ? 'document-text-outline'
                      : source.includes('api')
                      ? 'cloud-outline'
                      : 'information-circle-outline'
                  }
                  size={16}
                  color="#10B981"
                />
                <Text style={styles.sourceText}>{source.replace(/_/g, ' ')}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Recipe Data */}
        <View style={styles.recipeSection}>
          <Text style={styles.sectionTitle}>🍳 Recipe Data</Text>
          <View style={styles.recipeRow}>
            <Text style={styles.recipeLabel}>Title:</Text>
            <Text style={styles.recipeValue} numberOfLines={2}>
              {cookCard?.title || 'N/A'}
            </Text>
          </View>
          {cookCard?.source?.platform && (
            <View style={styles.recipeRow}>
              <Text style={styles.recipeLabel}>Platform:</Text>
              <Text style={styles.recipeValue}>{cookCard.source.platform}</Text>
            </View>
          )}
          {cookCard?.source?.creator?.name && (
            <View style={styles.recipeRow}>
              <Text style={styles.recipeLabel}>Creator:</Text>
              <Text style={styles.recipeValue}>{cookCard.source.creator.name}</Text>
            </View>
          )}
          <View style={styles.recipeRow}>
            <Text style={styles.recipeLabel}>Ingredients:</Text>
            <Text style={styles.recipeValue}>{cookCard?.ingredients?.length || 0}</Text>
          </View>
          {cookCard?.prep_time_minutes && (
            <View style={styles.recipeRow}>
              <Text style={styles.recipeLabel}>Prep Time:</Text>
              <Text style={styles.recipeValue}>{cookCard.prep_time_minutes} min</Text>
            </View>
          )}
          {cookCard?.cook_time_minutes && (
            <View style={styles.recipeRow}>
              <Text style={styles.recipeLabel}>Cook Time:</Text>
              <Text style={styles.recipeValue}>{cookCard.cook_time_minutes} min</Text>
            </View>
          )}
          {cookCard?.servings && (
            <View style={styles.recipeRow}>
              <Text style={styles.recipeLabel}>Servings:</Text>
              <Text style={styles.recipeValue}>{cookCard.servings}</Text>
            </View>
          )}
        </View>

        {/* Ingredients List */}
        {cookCard?.ingredients && cookCard.ingredients.length > 0 && (
          <View style={styles.ingredientsSection}>
            <Text style={styles.sectionTitle}>📝 Ingredients ({cookCard.ingredients.length})</Text>
            {cookCard.ingredients.slice(0, 10).map((ing: any, index: number) => (
              <View key={index} style={styles.ingredientItem}>
                <Text style={styles.ingredientText}>
                  {ing.amount && ing.unit ? `${ing.amount} ${ing.unit}` : ''} {ing.name}
                </Text>
                <View style={styles.ingredientMeta}>
                  <Text style={styles.ingredientConfidence}>
                    {(ing.confidence * 100).toFixed(0)}%
                  </Text>
                  {ing.canonical_item_id && (
                    <Ionicons name="link-outline" size={12} color="#10B981" />
                  )}
                </View>
              </View>
            ))}
            {cookCard.ingredients.length > 10 && (
              <Text style={styles.moreText}>+ {cookCard.ingredients.length - 10} more...</Text>
            )}
          </View>
        )}

        {/* Raw JSON (Collapsible) */}
        <Pressable
          style={styles.jsonToggle}
          onPress={() => console.log('Full CookCard:', JSON.stringify(cookCard, null, 2))}
        >
          <Text style={styles.jsonToggleText}>💾 View Full JSON in Console</Text>
        </Pressable>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Social Recipes Test</Text>
        <Text style={styles.headerSubtitle}>HTML Scraping Implementation</Text>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Info Card */}
        <View style={styles.infoCard}>
          <Ionicons name="flask" size={24} color="#3B82F6" />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.infoTitle}>Social Recipe Extraction Test</Text>
            <Text style={styles.infoText}>
              Paste a recipe URL from YouTube, TikTok, Instagram, or Xiaohongshu (RED) to test ingredient extraction.
            </Text>
          </View>
        </View>

        {/* URL Input */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Paste Recipe URL</Text>
          <View style={styles.inputContainer}>
            <Ionicons name="link-outline" size={20} color="#6B7280" style={{ marginRight: 8 }} />
            <TextInput
              style={styles.input}
              placeholder="https://www.tiktok.com/... or http://xhslink.com/..."
              value={customUrl}
              onChangeText={setCustomUrl}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
              multiline={false}
            />
          </View>
          <Pressable
            style={[styles.extractButton, loading && styles.extractButtonDisabled]}
            onPress={() => handleExtractUrl(customUrl)}
            disabled={loading || !customUrl.trim()}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="flask" size={20} color="#FFFFFF" />
                <Text style={styles.extractButtonText}>Extract Recipe</Text>
              </>
            )}
          </Pressable>
        </View>

        {/* Loading State */}
        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#10B981" />
            <Text style={styles.loadingText}>Extracting recipe...</Text>
            <Text style={styles.loadingSubtext}>
              Fetching HTML → Parsing sources → LLM extraction
            </Text>
          </View>
        )}

        {/* Extraction Result */}
        {renderExtractionResult()}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111827',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
  content: {
    flex: 1,
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: '#EFF6FF',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E40AF',
    marginBottom: 4,
  },
  infoText: {
    fontSize: 14,
    color: '#3B82F6',
    lineHeight: 20,
  },
  section: {
    marginHorizontal: 16,
    marginBottom: 24,
  },
  sectionHeader: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  testButton: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  testButtonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  testButtonLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginLeft: 8,
  },
  testButtonDescription: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 6,
  },
  testButtonUrl: {
    fontSize: 12,
    color: '#9CA3AF',
    fontFamily: 'monospace',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 12,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: '#111827',
  },
  extractButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  extractButtonDisabled: {
    backgroundColor: '#D1D5DB',
  },
  extractButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  loadingText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginTop: 12,
  },
  loadingSubtext: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
  resultContainer: {
    backgroundColor: '#FFFFFF',
    margin: 16,
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  resultTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginLeft: 12,
  },
  errorText: {
    fontSize: 14,
    color: '#EF4444',
    marginBottom: 12,
  },
  timeText: {
    fontSize: 12,
    color: '#6B7280',
  },
  metadataSection: {
    marginBottom: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  metadataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  metadataLabel: {
    fontSize: 14,
    color: '#6B7280',
    width: 100,
  },
  metadataValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
  },
  confidenceContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  confidenceBar: {
    flex: 1,
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    overflow: 'hidden',
  },
  confidenceFill: {
    height: '100%',
    backgroundColor: '#10B981',
  },
  confidenceText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#10B981',
    marginLeft: 8,
    width: 45,
  },
  sourcesSection: {
    marginBottom: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  sourceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#F0FDF4',
    borderRadius: 8,
    marginBottom: 6,
  },
  sourceText: {
    fontSize: 14,
    color: '#065F46',
    marginLeft: 8,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  recipeSection: {
    marginBottom: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  recipeRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  recipeLabel: {
    fontSize: 14,
    color: '#6B7280',
    width: 100,
  },
  recipeValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
    flex: 1,
  },
  ingredientsSection: {
    marginBottom: 20,
  },
  ingredientItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    marginBottom: 6,
  },
  ingredientText: {
    fontSize: 14,
    color: '#111827',
    flex: 1,
  },
  ingredientMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ingredientConfidence: {
    fontSize: 12,
    color: '#10B981',
    fontWeight: '600',
  },
  moreText: {
    fontSize: 14,
    color: '#6B7280',
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 8,
  },
  jsonToggle: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    alignItems: 'center',
  },
  jsonToggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
});
