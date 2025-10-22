import React, { useState, useEffect, useLayoutEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  Linking,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CookCard, PantryMatch, Ingredient } from '../types/CookCard';
import { IngredientListItem } from '../components/cookcard/IngredientListItem';
import { ConfidenceChip } from '../components/cookcard/ConfidenceChip';
import { logIngressEvent } from '../services/telemetry';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

interface CookCardScreenProps {
  route?: {
    params?: {
      cookCard: CookCard;
      mode?: 'normal' | 'needs_ingredients';
      sessionId?: string;
    };
  };
  cookCard?: CookCard;
  mode?: 'normal' | 'needs_ingredients'; // L1-only extractions need manual ingredient confirmation
  sessionId?: string; // For telemetry tracking
  onSave?: () => void;
  onCook?: () => void;
  onAddToShoppingList?: () => void;
}

/**
 * CookCardScreen Component
 *
 * Main screen for displaying a Cook Card with:
 * - Source attribution (creator, platform, link)
 * - Pantry match intelligence
 * - Ingredient list with Have/Need status
 * - Cost range (TODO: Task 3.2)
 * - Substitution toggle
 * - Confirmation flow for low-confidence extractions
 *
 * PRD Reference: COOKCARD_PRD_V1.md Section 4 (Core Product)
 */
export const CookCardScreen: React.FC<CookCardScreenProps> = (props) => {
  const navigation = useNavigation();
  const { householdId, user } = useAuth();
  const userId = user?.id;

  // Support both route params (from navigation) and direct props
  const cookCard = props.route?.params?.cookCard || props.cookCard;
  const mode = props.route?.params?.mode || props.mode || 'normal';
  const sessionId = props.route?.params?.sessionId || props.sessionId;
  const { onSave, onCook, onAddToShoppingList } = props;

  // Add close button to header (modal presentation)
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => {
            if (navigation.canGoBack()) {
              navigation.goBack();
            }
          }}
          style={{ paddingRight: 16 }}
        >
          <Ionicons name="close" size={28} color="#000" />
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  if (!cookCard) {
    return (
      <View style={styles.container}>
        <Text>Error: No Cook Card data provided</Text>
      </View>
    );
  }
  const [allowSubstitutions, setAllowSubstitutions] = useState(true);
  const [pantryMatch, setPantryMatch] = useState<PantryMatch | null>(null);
  const [saved, setSaved] = useState(false);
  const [hasCooked, setHasCooked] = useState(false);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [rating, setRating] = useState(0);
  const [ratingNotes, setRatingNotes] = useState('');

  useEffect(() => {
    calculatePantryMatch();
  }, [cookCard, allowSubstitutions]);

  // Default save handler if none provided
  const handleSave = async () => {
    if (onSave) {
      onSave();
    } else {
      // Default save behavior - save to database and log telemetry
      try {
        // Import services dynamically
        const { saveCookCard } = await import('../services/cookCardService');
        const { supabase } = await import('../lib/supabase');

        // Get user info
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          Alert.alert('Error', 'You must be logged in to save recipes');
          return;
        }

        // Get household ID (optional)
        const { data: profile } = await supabase
          .from('profiles')
          .select('household_id')
          .eq('id', user.id)
          .single();

        // Save to database
        const result = await saveCookCard(
          cookCard,
          user.id,
          profile?.household_id || undefined
        );

        if (result.alreadyExists) {
          console.log('Cook Card already saved:', result.id);
          Alert.alert(
            'Already Saved',
            "You've already saved this recipe!",
            [{ text: 'OK' }]
          );
          // Don't change saved state - it was already saved
          return;
        }

        // Only set saved if it's a new save
        setSaved(true);
        console.log('Cook Card saved:', result.id);

        // Log telemetry
        if (sessionId) {
          logIngressEvent({
            sessionId,
            eventType: 'cook_card_saved',
            ingressMethod: mode === 'needs_ingredients' ? 'paste_link' : 'share_extension_ios',
            platform: cookCard.source.platform as any,
            recipeUrl: cookCard.source.url,
            metadata: {
              extraction_method: cookCard.extraction?.method,
              confidence: cookCard.extraction?.confidence,
              cook_card_id: result.id,
            },
          });
        }

        // Show success message and navigate back
        Alert.alert(
          'Recipe Saved',
          'This Cook Card has been saved to your collection.',
          [
            {
              text: 'OK',
              onPress: () => {
                // Navigate back to recipes screen
                if (navigation.canGoBack()) {
                  navigation.goBack();
                }
              },
            },
          ]
        );
      } catch (error) {
        console.error('Failed to save Cook Card:', error);
        setSaved(false);
        Alert.alert(
          'Save Failed',
          'Could not save recipe. Please try again.',
          [{ text: 'OK' }]
        );
      }
    }
  };

  /**
   * Handle add missing ingredients to shopping list
   */
  const handleAddMissingToShoppingList = async () => {
    if (!pantryMatch || pantryMatch.need === 0) {
      Alert.alert('Nothing to Add', 'You have all the ingredients!');
      return;
    }

    try {
      const { addIngredientsToShoppingList } = await import('../services/shoppingListService');
      const { supabase } = await import('../lib/supabase');

      // Get user and household
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Error', 'You must be logged in');
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('household_id')
        .eq('id', user.id)
        .single();

      if (!profile?.household_id) {
        Alert.alert('Error', 'Could not find your household');
        return;
      }

      // Get missing ingredient names
      const missingNames = pantryMatch.missing_ingredients.map(ing => ing.name);

      // Add to shopping list
      const result = await addIngredientsToShoppingList(
        missingNames,
        profile.household_id,
        cookCard.id,
        cookCard.title
      );

      // Show success
      if (result.added > 0) {
        const message = result.duplicates > 0
          ? `Added ${result.added} item${result.added > 1 ? 's' : ''} (${result.duplicates} already in list)`
          : `Added ${result.added} item${result.added > 1 ? 's' : ''} to your shopping list`;

        Alert.alert('Success', message);
      } else {
        Alert.alert('Already Added', 'All items are already in your shopping list');
      }
    } catch (error) {
      console.error('Failed to add to shopping list:', error);
      Alert.alert('Error', 'Failed to add items to shopping list');
    }
  };

  /**
   * Calculate pantry match percentage
   */
  const calculatePantryMatch = async () => {
    if (!userId || !householdId) {
      // No user logged in, can't check pantry
      return;
    }

    try {
      // Fetch user's pantry items
      const { data: pantryItems, error } = await supabase
        .from('pantry_items')
        .select('canonical_item_id, name')
        .eq('household_id', householdId)
        .gte('quantity', 0.01); // Only items with quantity > 0

      if (error) {
        console.error('Error fetching pantry:', error);
        return;
      }

      // Create a Set of canonical item IDs the user has
      const pantryCanonicalIds = new Set(
        pantryItems?.map(item => item.canonical_item_id).filter(Boolean) || []
      );

      // Mark each ingredient as in_pantry or not
      const updatedIngredients = cookCard.ingredients.map(ing => ({
        ...ing,
        in_pantry: ing.canonical_item_id ? pantryCanonicalIds.has(ing.canonical_item_id) : false,
      }));

      // Filter out optional ingredients and substitutions (if toggle is off)
      const requiredIngredients = updatedIngredients.filter((ing) => {
        if (ing.is_optional) return false;
        if (!allowSubstitutions && ing.is_substitution) return false;
        return true;
      });

      const available = requiredIngredients.filter((ing) => ing.in_pantry);
      const missing = requiredIngredients.filter((ing) => !ing.in_pantry);

      const matchPercentage =
        requiredIngredients.length > 0
          ? (available.length / requiredIngredients.length) * 100
          : 0;

      setPantryMatch({
        have: available.length,
        need: missing.length,
        match_percentage: Math.round(matchPercentage),
        missing_ingredients: missing,
        available_ingredients: available,
      });

      // Update the cookCard ingredients with in_pantry flags (for display)
      cookCard.ingredients = updatedIngredients;
    } catch (error) {
      console.error('Error calculating pantry match:', error);
    }
  };

  /**
   * Open original recipe URL
   */
  const openSourceURL = () => {
    Linking.openURL(cookCard.source.url).catch((err) =>
      Alert.alert('Error', 'Could not open URL')
    );
  };

  /**
   * Mark recipe as cooked and log to meal history
   */
  const handleMarkAsCooked = async () => {
    if (!userId || !householdId) {
      Alert.alert('Error', 'You must be logged in to track meals');
      return;
    }

    setHasCooked(true);
    setShowRatingModal(true);
  };

  /**
   * Submit rating and notes to meal history
   */
  const handleSubmitRating = async () => {
    if (!userId || !householdId) return;

    try {
      const { error } = await supabase
        .from('meal_history')
        .insert({
          user_id: userId,
          household_id: householdId,
          cook_card_id: cookCard.id,
          cooked_at: new Date().toISOString(),
          rating: rating > 0 ? rating : null,
          notes: ratingNotes.trim() || null,
        });

      if (error) {
        console.error('Error saving meal history:', error);
        Alert.alert('Error', 'Failed to save cooking history');
        return;
      }

      setShowRatingModal(false);
      Alert.alert('Success', 'Cooking session logged! 🎉');
    } catch (error) {
      console.error('Error in handleSubmitRating:', error);
      Alert.alert('Error', 'Failed to save cooking history');
    }
  };

  /**
   * Check if Cook Card requires user confirmation
   */
  const requiresConfirmation = (): boolean => {
    return cookCard.extraction.confidence < 0.8;
  };

  /**
   * Format time estimate
   */
  const formatTime = (minutes?: number): string => {
    if (!minutes) return '';
    if (minutes < 60) return `${minutes}min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
  };

  return (
    <ScrollView style={styles.container}>
      {/* Close Button */}
      <TouchableOpacity
        onPress={() => navigation.canGoBack() && navigation.goBack()}
        style={styles.closeButton}
      >
        <Ionicons name="close" size={28} color="#000" />
      </TouchableOpacity>

      {/* L1-Only Banner (needs_ingredients mode) */}
      {mode === 'needs_ingredients' && (
        <View style={styles.amberBanner}>
          <Text style={styles.amberBannerText}>
            ⚠️ We found the recipe but couldn't extract ingredients automatically.
            Add ingredients manually to complete this Cook Card.
          </Text>
        </View>
      )}

      {/* Confidence Banner (if <0.80) */}
      {mode === 'normal' && requiresConfirmation() && (
        <View style={styles.amberBanner}>
          <Text style={styles.amberBannerText}>
            ⚠️ We found {cookCard.ingredients.length} of ~
            {Math.ceil(cookCard.ingredients.length / cookCard.extraction.confidence)}{' '}
            ingredients. Tap to confirm before planning.
          </Text>
        </View>
      )}

      {/* Header: Creator & Source */}
      <View style={styles.header}>
        {cookCard.source.creator.avatar_url && (
          <Image
            source={{ uri: cookCard.source.creator.avatar_url }}
            style={styles.avatar}
          />
        )}
        <View style={styles.creatorInfo}>
          <Text style={styles.creatorName}>
            {cookCard.source.creator.name || cookCard.source.creator.handle}
            {cookCard.source.creator.verified && ' ✓'}
          </Text>
          <TouchableOpacity onPress={openSourceURL}>
            <Text style={styles.sourceLink}>
              View on {cookCard.source.platform}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Recipe Image */}
      {cookCard.image_url && (
        <Image source={{ uri: cookCard.image_url }} style={styles.recipeImage} />
      )}

      {/* Title & Description */}
      <View style={styles.recipeInfo}>
        <Text style={styles.title}>{cookCard.title}</Text>
        {cookCard.description && (
          <Text style={styles.description}>{cookCard.description}</Text>
        )}

        {/* Time Estimates */}
        {(cookCard.prep_time_minutes ||
          cookCard.cook_time_minutes ||
          cookCard.servings) && (
          <View style={styles.metadata}>
            {cookCard.prep_time_minutes && (
              <Text style={styles.metadataText}>
                Prep: {formatTime(cookCard.prep_time_minutes)}
              </Text>
            )}
            {cookCard.cook_time_minutes && (
              <Text style={styles.metadataText}>
                Cook: {formatTime(cookCard.cook_time_minutes)}
              </Text>
            )}
            {cookCard.servings && (
              <Text style={styles.metadataText}>
                Serves: {cookCard.servings}
              </Text>
            )}
          </View>
        )}

        {/* Extraction Provenance Badge */}
        {cookCard.extraction?.sources && cookCard.extraction.sources.length > 0 && (
          <View style={styles.provenanceBadge}>
            <Ionicons name="checkmark-circle" size={14} color="#10B981" />
            <Text style={styles.provenanceText}>
              Extracted from: {cookCard.extraction.sources.map((s: string) => s.replace(/_/g, ' ')).join(', ')}
            </Text>
          </View>
        )}
      </View>

      {/* Pantry Match Intelligence */}
      {pantryMatch && (
        <View style={styles.pantryMatch}>
          <View style={styles.pantryMatchHeader}>
            <Text style={styles.pantryMatchTitle}>Pantry Match</Text>
            <View style={styles.matchPercentage}>
              <Text style={styles.matchPercentageText}>
                {pantryMatch.match_percentage}%
              </Text>
            </View>
          </View>
          <Text style={styles.pantryMatchSubtitle}>
            {pantryMatch.have} of {pantryMatch.have + pantryMatch.need} ingredients
            in your pantry
          </Text>

          {/* Substitution Toggle */}
          <TouchableOpacity
            style={styles.toggleButton}
            onPress={() => setAllowSubstitutions(!allowSubstitutions)}
          >
            <View
              style={[
                styles.toggleSwitch,
                allowSubstitutions && styles.toggleSwitchActive,
              ]}
            >
              <View
                style={[
                  styles.toggleKnob,
                  allowSubstitutions && styles.toggleKnobActive,
                ]}
              />
            </View>
            <Text style={styles.toggleLabel}>Allow substitutions</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Ingredients List */}
      <View style={styles.ingredientsSection}>
        <Text style={styles.sectionTitle}>Ingredients</Text>

        {/* Group ingredients by group (if any) */}
        {cookCard.ingredients
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((ingredient, index) => (
            <IngredientListItem
              key={`${ingredient.name}-${index}`}
              ingredient={ingredient}
              onPress={() => {
                // TODO: Open ingredient editor
                console.log('Edit ingredient:', ingredient.name);
              }}
            />
          ))}
      </View>

      {/* Instructions (Structured Steps) */}
      {(cookCard.instructions.type === 'creator_provided' || cookCard.instructions.type === 'steps') && cookCard.instructions.steps && (
        <View style={styles.instructionsSection}>
          <Text style={styles.sectionTitle}>
            Cooking Steps ({cookCard.instructions.steps.length})
          </Text>
          {cookCard.instructions.steps.map((step, index) => (
            <View key={index} style={styles.instructionStep}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>{step.step_number}</Text>
              </View>
              <View style={styles.stepContent}>
                <Text style={styles.stepInstruction}>{step.instruction}</Text>
                {step.ingredients && step.ingredients.length > 0 && (
                  <View style={styles.stepIngredients}>
                    {step.ingredients.map((ing, i) => (
                      <View key={i} style={styles.ingredientPill}>
                        <Text style={styles.ingredientPillText}>{ing}</Text>
                      </View>
                    ))}
                  </View>
                )}
                {step.tip && (
                  <View style={styles.stepTip}>
                    <Ionicons name="bulb-outline" size={14} color="#F59E0B" />
                    <Text style={styles.stepTipText}>{step.tip}</Text>
                  </View>
                )}
              </View>
            </View>
          ))}
          <TouchableOpacity style={styles.linkButton} onPress={openSourceURL}>
            <Text style={styles.linkButtonText}>
              View original on {cookCard.source.platform}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Instructions (Link to Source) */}
      {cookCard.instructions.type === 'link_only' && (
        <View style={styles.instructionsSection}>
          <Text style={styles.sectionTitle}>Instructions</Text>
          <TouchableOpacity style={styles.linkButton} onPress={openSourceURL}>
            <Text style={styles.linkButtonText}>
              View full recipe on {cookCard.source.platform}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Action Buttons */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.primaryButton, saved && styles.buttonDisabled]}
          onPress={handleSave}
          disabled={saved}
        >
          <Text style={styles.primaryButtonText}>
            {saved ? 'Recipe Saved ✓' : 'Save Recipe'}
          </Text>
        </TouchableOpacity>

        {/* Show "Add Ingredients" CTA if no ingredients, otherwise show shopping list button */}
        {cookCard.ingredients.length === 0 || mode === 'needs_ingredients' ? (
          <TouchableOpacity
            style={styles.addIngredientsButton}
            onPress={() => {
              Alert.alert(
                'Add Ingredients',
                'Ingredient parsing coming soon! For now, you can save this recipe and view it on the original platform.',
                [{ text: 'OK' }]
              );
            }}
          >
            <Text style={styles.addIngredientsButtonText}>+ Add Ingredients</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[
              styles.secondaryButton,
              requiresConfirmation() && styles.buttonDisabled,
            ]}
            onPress={onAddToShoppingList || handleAddMissingToShoppingList}
            disabled={requiresConfirmation()}
          >
            <Text style={styles.secondaryButtonText}>Add to Shopping List</Text>
          </TouchableOpacity>
        )}

        {onCook && (
          <TouchableOpacity style={styles.secondaryButton} onPress={onCook}>
            <Text style={styles.secondaryButtonText}>Start Cooking</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[
            styles.markCookedButton,
            hasCooked && styles.buttonDisabled,
          ]}
          onPress={handleMarkAsCooked}
          disabled={hasCooked}
        >
          <Text style={styles.markCookedButtonText}>
            {hasCooked ? 'Marked as Cooked ✓' : '🍳 Mark as Cooked'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Extraction Metadata (Debug) */}
      <View style={styles.debugSection}>
        <Text style={styles.debugTitle}>Extraction Info</Text>
        <Text style={styles.debugText}>
          Method: {cookCard.extraction.method}
        </Text>
        <Text style={styles.debugText}>
          Confidence: {Math.round(cookCard.extraction.confidence * 100)}%
        </Text>
        <Text style={styles.debugText}>
          Version: {cookCard.extraction.version}
        </Text>
        {cookCard.extraction.cost_cents > 0 && (
          <Text style={styles.debugText}>
            Cost: ${(cookCard.extraction.cost_cents / 100).toFixed(3)}
          </Text>
        )}
      </View>

      {/* Rating Modal */}
      <Modal
        visible={showRatingModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowRatingModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>How was it?</Text>
            <Text style={styles.modalSubtitle}>{cookCard.title}</Text>

            {/* Star Rating */}
            <View style={styles.starContainer}>
              {[1, 2, 3, 4, 5].map((star) => (
                <TouchableOpacity
                  key={star}
                  onPress={() => setRating(star)}
                  style={styles.starButton}
                >
                  <Text style={styles.starText}>
                    {star <= rating ? '⭐' : '☆'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Notes Input */}
            <TextInput
              style={styles.notesInput}
              placeholder="Add notes (optional)"
              placeholderTextColor="#9CA3AF"
              value={ratingNotes}
              onChangeText={setRatingNotes}
              multiline
              numberOfLines={3}
            />

            {/* Action Buttons */}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => {
                  setShowRatingModal(false);
                  setRating(0);
                  setRatingNotes('');
                }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalSubmitButton}
                onPress={handleSubmitRating}
              >
                <Text style={styles.modalSubmitText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 1000,
    backgroundColor: '#F3F4F6',
    borderRadius: 20,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  amberBanner: {
    backgroundColor: '#FEF3C7',
    padding: 16,
    borderBottomWidth: 2,
    borderBottomColor: '#F59E0B',
  },
  amberBannerText: {
    color: '#92400E',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 12,
  },
  creatorInfo: {
    flex: 1,
  },
  creatorName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  sourceLink: {
    fontSize: 14,
    color: '#3B82F6',
    marginTop: 2,
  },
  recipeImage: {
    width: '100%',
    height: 240,
    backgroundColor: '#F3F4F6',
  },
  recipeInfo: {
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
    marginBottom: 12,
  },
  metadata: {
    flexDirection: 'row',
    gap: 16,
  },
  metadataText: {
    fontSize: 14,
    color: '#6B7280',
  },
  provenanceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#F0FDF4',
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  provenanceText: {
    fontSize: 12,
    color: '#065F46',
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  pantryMatch: {
    backgroundColor: '#F9FAFB',
    padding: 16,
    marginHorizontal: 16,
    borderRadius: 8,
    marginBottom: 16,
  },
  pantryMatchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  pantryMatchTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  matchPercentage: {
    backgroundColor: '#10B981',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  matchPercentageText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  pantryMatchSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 12,
  },
  toggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  toggleSwitch: {
    width: 44,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#D1D5DB',
    padding: 2,
    marginRight: 8,
  },
  toggleSwitchActive: {
    backgroundColor: '#10B981',
  },
  toggleKnob: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
  },
  toggleKnobActive: {
    transform: [{ translateX: 20 }],
  },
  toggleLabel: {
    fontSize: 14,
    color: '#374151',
  },
  ingredientsSection: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  instructionsSection: {
    padding: 16,
  },
  instructionStep: {
    flexDirection: 'row',
    marginBottom: 20,
    gap: 12,
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  stepNumberText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  stepContent: {
    flex: 1,
  },
  stepInstruction: {
    fontSize: 16,
    color: '#111827',
    lineHeight: 24,
    marginBottom: 8,
  },
  stepIngredients: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  ingredientPill: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  ingredientPillText: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  stepTip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: '#FEF3C7',
    padding: 10,
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#F59E0B',
  },
  stepTipText: {
    flex: 1,
    fontSize: 13,
    color: '#92400E',
    lineHeight: 18,
  },
  linkButton: {
    backgroundColor: '#3B82F6',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
  },
  linkButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  actions: {
    padding: 16,
    gap: 12,
  },
  primaryButton: {
    backgroundColor: '#10B981',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: '#F3F4F6',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#374151',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  addIngredientsButton: {
    backgroundColor: '#3B82F6',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#2563EB',
    borderStyle: 'dashed',
  },
  addIngredientsButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  debugSection: {
    padding: 16,
    backgroundColor: '#F9FAFB',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  debugTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 4,
  },
  debugText: {
    fontSize: 11,
    color: '#9CA3AF',
    marginBottom: 2,
  },
  markCookedButton: {
    backgroundColor: '#10B981',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  markCookedButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    width: '85%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 16,
    color: '#6B7280',
    marginBottom: 20,
    textAlign: 'center',
  },
  starContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 20,
  },
  starButton: {
    padding: 8,
  },
  starText: {
    fontSize: 36,
  },
  notesInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#111827',
    marginBottom: 20,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    marginRight: 8,
    alignItems: 'center',
  },
  modalCancelText: {
    color: '#6B7280',
    fontSize: 16,
    fontWeight: '600',
  },
  modalSubmitButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#2563EB',
    marginLeft: 8,
    alignItems: 'center',
  },
  modalSubmitText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
