import React, { useState, useEffect, useLayoutEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  Alert,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
      cookCard?: CookCard;
      cookCardId?: string; // ID of user's saved cook_card
      recipeDatabaseId?: string; // ID of recipe_database recipe
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

  // Extract route params
  const cookCardId = props.route?.params?.cookCardId;
  const recipeDatabaseId = props.route?.params?.recipeDatabaseId;
  const mode = props.route?.params?.mode || props.mode || 'normal';
  const sessionId = props.route?.params?.sessionId || props.sessionId;
  const { onSave, onCook, onAddToShoppingList } = props;

  // State for loaded cook card
  const [cookCard, setCookCard] = useState<CookCard | null>(
    props.route?.params?.cookCard || props.cookCard || null
  );
  const [loading, setLoading] = useState(false);
  const [isFromDatabase, setIsFromDatabase] = useState(!!recipeDatabaseId);

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

  // Load cook card data if IDs provided
  useEffect(() => {
    const loadCookCard = async () => {
      if (cookCard) return; // Already have cook card from props

      if (!cookCardId && !recipeDatabaseId) {
        console.error('[CookCard] No cook card, cookCardId, or recipeDatabaseId provided');
        return;
      }

      setLoading(true);

      try {
        if (recipeDatabaseId) {
          // Load from recipe_database
          console.log('[CookCard] Loading recipe from database:', recipeDatabaseId.substring(0, 8));
          const { data: recipe, error } = await supabase
            .from('recipe_database')
            .select(`
              *,
              ingredients:recipe_database_ingredients(*),
              instructions:recipe_database_instructions(*)
            `)
            .eq('id', recipeDatabaseId)
            .single();

          if (error) throw error;
          if (!recipe) throw new Error('Recipe not found');

          console.log('[CookCard] Loaded recipe:', {
            id: recipe.id.substring(0, 8),
            title: recipe.title,
            ingredientCount: recipe.ingredients?.length || 0,
            instructionCount: recipe.instructions?.length || 0
          });

          // Transform to CookCard format
          const transformedCookCard: CookCard = {
            id: recipe.id,
            version: '1.0',
            source: {
              url: recipe.source_url || '',
              platform: (recipe.platform as Platform) || 'web',
              creator: {
                name: recipe.creator_name || 'Pantry App',
                handle: recipe.creator_name || undefined,
                avatar_url: undefined,
                verified: false,
              },
            },
            title: recipe.title,
            description: recipe.description || undefined,
            image_url: recipe.image_url || undefined,
            prep_time_minutes: recipe.prep_time_minutes || undefined,
            cook_time_minutes: recipe.cook_time_minutes || undefined,
            total_time_minutes: recipe.total_time_minutes || undefined,
            servings: recipe.servings || undefined,
            instructions: recipe.instructions && recipe.instructions.length > 0
              ? {
                  type: 'steps',
                  steps: recipe.instructions
                    .sort((a: any, b: any) => a.step_number - b.step_number)
                    .map((step: any) => ({
                      step_number: step.step_number,
                      instruction: step.instruction_text,
                    })),
                }
              : {
                  type: 'link_only',
                },
            ingredients: (recipe.ingredients || []).map((ing: any, index: number) => ({
              name: ing.ingredient_name,
              normalized_name: ing.normalized_name || undefined,
              canonical_item_id: ing.canonical_item_id || undefined,
              amount: ing.amount || undefined,
              unit: ing.unit || undefined,
              preparation: ing.preparation || undefined,
              confidence: 1.0,
              provenance: 'creator_provided' as IngredientProvenance,
              sort_order: ing.sort_order || index,
              is_optional: ing.is_optional || false,
            })),
            extraction: {
              method: 'metadata',
              confidence: 1.0,
              version: 'recipe_database',
              timestamp: recipe.created_at,
              cost_cents: 0,
            },
            created_at: recipe.created_at,
            updated_at: recipe.updated_at || recipe.created_at,
          };

          setCookCard(transformedCookCard);
          setIsFromDatabase(true);
        } else if (cookCardId) {
          // Load from cook_cards (user's saved recipes)
          const { data: card, error } = await supabase
            .from('cook_cards')
            .select('cook_card_data')
            .eq('id', cookCardId)
            .single();

          if (error) throw error;
          if (!card) throw new Error('Cook card not found');

          setCookCard(card.cook_card_data as CookCard);
          setIsFromDatabase(false);
        }
      } catch (error) {
        console.error('[CookCard] Error loading cook card:', error);
        Alert.alert('Error', 'Failed to load recipe');
      } finally {
        setLoading(false);
      }
    };

    loadCookCard();
  }, [cookCardId, recipeDatabaseId, cookCard]);

  const [pantryMatch, setPantryMatch] = useState<PantryMatch | null>(null);
  const [saved, setSaved] = useState(false);
  const [showShoppingListModal, setShowShoppingListModal] = useState(false);
  const [selectedOptionalIngredients, setSelectedOptionalIngredients] = useState<Set<string>>(new Set());

  useEffect(() => {
    calculatePantryMatch();
  }, [cookCard]);

  // Default save handler if none provided
  const handleSave = async () => {
    if (onSave) {
      onSave();
      return;
    }

    if (!cookCard) {
      Alert.alert('Error', 'No recipe to save');
      return;
    }

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
  };

  /**
   * Handle add missing ingredients to shopping list
   * Opens modal to let user select optional ingredients
   */
  const handleAddMissingToShoppingList = async () => {
    if (!pantryMatch || pantryMatch.need === 0) {
      Alert.alert('Nothing to Add', 'You have all the ingredients!');
      return;
    }

    // Separate required and optional missing ingredients
    const requiredMissing = pantryMatch.missing_ingredients.filter(ing => !ing.is_optional);
    const optionalMissing = pantryMatch.missing_ingredients.filter(ing => ing.is_optional);

    console.log('[CookCard] Shopping list breakdown:', {
      totalMissing: pantryMatch.missing_ingredients.length,
      requiredCount: requiredMissing.length,
      optionalCount: optionalMissing.length,
      optionals: optionalMissing.map(ing => ing.name),
    });

    // If no optional ingredients, add directly
    if (optionalMissing.length === 0) {
      console.log('[CookCard] No optionals, adding directly');
      await confirmAddToShoppingList(requiredMissing.map(ing => ing.name));
      return;
    }

    // Show modal for optional selection
    console.log('[CookCard] Showing modal with optional ingredients');
    setSelectedOptionalIngredients(new Set()); // Reset selection
    setShowShoppingListModal(true);
  };

  /**
   * Actually add selected ingredients to shopping list
   */
  const confirmAddToShoppingList = async (ingredientNames: string[]) => {

    // Check if user is logged in
    if (!userId) {
      Alert.alert('Error', 'You must be logged in');
      return;
    }

    try {
      let activeHouseholdId = householdId;

      // If no householdId from context, try to get or create one
      if (!activeHouseholdId) {
        console.log('[CookCard] No householdId in context, attempting to create...');
        const { data: newHouseholdId, error } = await supabase.rpc('get_or_create_household');

        if (error || !newHouseholdId) {
          console.error('[CookCard] Failed to get/create household:', error);
          Alert.alert(
            'Setup Required',
            'Please complete your profile setup to use shopping lists. Go to Profile > Settings.'
          );
          return;
        }

        activeHouseholdId = newHouseholdId;
        console.log('[CookCard] Created household:', activeHouseholdId);
      }

      const { addIngredientsToShoppingList } = await import('../services/shoppingListService');

      // Map ingredient names to objects with optional flag
      // Canonical matching will happen later when items are moved to inventory
      const ingredientObjects = ingredientNames.map(name => {
        const matchingIngredient = cookCard.ingredients.find(ing => ing.name === name);
        return matchingIngredient ? {
          name: matchingIngredient.name,
          is_optional: matchingIngredient.is_optional
        } : name; // Fallback to just name if not found
      });

      // Add to shopping list (canonical matching happens at inventory time)
      const result = await addIngredientsToShoppingList(
        ingredientObjects,
        activeHouseholdId,
        cookCard.id,
        cookCard.title
      );

      // Show success with navigation hint
      if (result.added > 0) {
        const message = result.duplicates > 0
          ? `Added ${result.added} item${result.added > 1 ? 's' : ''} to your shopping list (${result.duplicates} already in list).\n\nCheck the Shopping tab to see your list!`
          : `Added ${result.added} item${result.added > 1 ? 's' : ''} to your shopping list!\n\nCheck the Shopping tab to see them.`;

        Alert.alert('✅ Success', message, [
          { text: 'OK', style: 'default' }
        ]);
      } else {
        Alert.alert('Already Added', 'All items are already in your shopping list.\n\nCheck the Shopping tab to see your list.');
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

    if (!cookCard) {
      // CookCard not loaded yet
      return;
    }

    try {
      // Fetch user's pantry items
      const { data: pantryItems, error } = await supabase
        .from('pantry_items')
        .select('canonical_item_id, name')
        .eq('household_id', householdId)
        .eq('status', 'active') // Only active items
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

      // Filter out optional ingredients
      const requiredIngredients = updatedIngredients.filter((ing) => {
        if (ing.is_optional) return false;
        return true;
      });

      // Also track optional ingredients separately for shopping list modal
      const optionalIngredients = updatedIngredients.filter((ing) => ing.is_optional);

      const available = requiredIngredients.filter((ing) => ing.in_pantry);
      const missing = requiredIngredients.filter((ing) => !ing.in_pantry);
      const missingOptionals = optionalIngredients.filter((ing) => !ing.in_pantry);

      // Combine all missing for shopping list (required + optional)
      const allMissing = [...missing, ...missingOptionals];

      const matchPercentage =
        requiredIngredients.length > 0
          ? (available.length / requiredIngredients.length) * 100
          : 0;

      console.log('[CookCard] Pantry match calculated:', {
        total: requiredIngredients.length,
        available: available.length,
        missing: missing.length,
        missingOptionals: missingOptionals.length,
        percentage: Math.round(matchPercentage)
      });

      setPantryMatch({
        have: available.length,
        need: missing.length,
        match_percentage: Math.round(matchPercentage),
        missing_ingredients: allMissing, // Include both required and optional
        available_ingredients: available,
      });

      // Update the cookCard ingredients with in_pantry flags (for display)
      cookCard.ingredients = updatedIngredients;
    } catch (error) {
      console.error('Error calculating pantry match:', error);
    }
  };


  /**
   * Check if Cook Card requires user confirmation
   */
  const requiresConfirmation = (): boolean => {
    return (cookCard.extraction?.confidence ?? 1) < 0.8;
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

  // Loading state
  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color="#10B981" />
        <Text style={styles.loadingText}>Loading recipe...</Text>
      </View>
    );
  }

  // Error state
  if (!cookCard) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <Text style={styles.errorText}>Error: No recipe data provided</Text>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => navigation.canGoBack() && navigation.goBack()}
        >
          <Text style={styles.secondaryButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

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
            {Math.ceil(cookCard.ingredients.length / (cookCard.extraction?.confidence ?? 1))}{' '}
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
        {(cookCard.extraction?.sources?.length ?? 0) > 0 && (
          <View style={styles.provenanceBadge}>
            <Ionicons name="checkmark-circle" size={14} color="#10B981" />
            <Text style={styles.provenanceText}>
              Extracted from: {cookCard.extraction?.sources?.map((s: string) => s.replace(/_/g, ' ')).join(', ')}
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
        </View>
      )}

      {/* Instructions (Link to Source) */}
      {cookCard.instructions.type === 'link_only' && (
        <View style={styles.instructionsSection}>
          <Text style={styles.sectionTitle}>Instructions</Text>
          <Text style={styles.linkOnlyMessage}>
            Full cooking instructions are not available for this recipe.
          </Text>
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
      </View>

      {/* Extraction Metadata (Debug) */}
      <View style={styles.debugSection}>
        <Text style={styles.debugTitle}>Extraction Info</Text>
        <Text style={styles.debugText}>
          Method: {cookCard.extraction?.method ?? 'N/A'}
        </Text>
        <Text style={styles.debugText}>
          Confidence: {Math.round((cookCard.extraction?.confidence ?? 1) * 100)}%
        </Text>
        <Text style={styles.debugText}>
          Version: {cookCard.extraction?.version ?? 'N/A'}
        </Text>
        {(cookCard.extraction?.cost_cents ?? 0) > 0 && (
          <Text style={styles.debugText}>
            Cost: ${((cookCard.extraction?.cost_cents ?? 0) / 100).toFixed(3)}
          </Text>
        )}
      </View>

      {/* Shopping List Selection Modal */}
      <Modal
        visible={showShoppingListModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowShoppingListModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add to Shopping List</Text>
            <Text style={styles.modalSubtitle}>Select ingredients to add</Text>

            <ScrollView style={styles.ingredientScrollView}>
              {/* Required Ingredients */}
              {pantryMatch && pantryMatch.missing_ingredients.filter(ing => !ing.is_optional).length > 0 && (
                <>
                  <Text style={styles.ingredientSectionTitle}>Required</Text>
                  {pantryMatch.missing_ingredients.filter(ing => !ing.is_optional).map((ingredient) => (
                    <View key={ingredient.name} style={styles.ingredientCheckboxRow}>
                      <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                      <Text style={styles.ingredientCheckboxLabel}>{ingredient.name}</Text>
                    </View>
                  ))}
                </>
              )}

              {/* Optional Ingredients */}
              {pantryMatch && pantryMatch.missing_ingredients.filter(ing => ing.is_optional).length > 0 && (
                <>
                  <Text style={styles.ingredientSectionTitle}>Optional (select if desired)</Text>
                  {pantryMatch.missing_ingredients.filter(ing => ing.is_optional).map((ingredient) => (
                    <TouchableOpacity
                      key={ingredient.name}
                      style={styles.ingredientCheckboxRow}
                      onPress={() => {
                        const newSelected = new Set(selectedOptionalIngredients);
                        if (newSelected.has(ingredient.name)) {
                          newSelected.delete(ingredient.name);
                        } else {
                          newSelected.add(ingredient.name);
                        }
                        setSelectedOptionalIngredients(newSelected);
                      }}
                    >
                      <Ionicons
                        name={selectedOptionalIngredients.has(ingredient.name) ? 'checkbox' : 'square-outline'}
                        size={20}
                        color={selectedOptionalIngredients.has(ingredient.name) ? '#10B981' : '#9CA3AF'}
                      />
                      <Text style={styles.ingredientCheckboxLabel}>{ingredient.name}</Text>
                    </TouchableOpacity>
                  ))}
                </>
              )}
            </ScrollView>

            {/* Action Buttons */}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setShowShoppingListModal(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalSubmitButton}
                onPress={async () => {
                  if (!pantryMatch) return;

                  // Combine required and selected optional ingredients
                  const requiredNames = pantryMatch.missing_ingredients
                    .filter(ing => !ing.is_optional)
                    .map(ing => ing.name);
                  const selectedOptionalNames = Array.from(selectedOptionalIngredients);
                  const allIngredients = [...requiredNames, ...selectedOptionalNames];

                  setShowShoppingListModal(false);
                  await confirmAddToShoppingList(allIngredients);
                }}
              >
                <Text style={styles.modalSubmitText}>Add {
                  (pantryMatch?.missing_ingredients.filter(ing => !ing.is_optional).length || 0) +
                  selectedOptionalIngredients.size
                } items</Text>
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
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6B7280',
  },
  errorText: {
    fontSize: 16,
    color: '#EF4444',
    marginBottom: 20,
    textAlign: 'center',
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
  linkOnlyMessage: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    paddingVertical: 20,
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
  ingredientScrollView: {
    maxHeight: 300,
    marginBottom: 20,
  },
  ingredientSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    marginTop: 12,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  ingredientCheckboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  ingredientCheckboxLabel: {
    fontSize: 16,
    color: '#111827',
    marginLeft: 12,
    flex: 1,
  },
});
