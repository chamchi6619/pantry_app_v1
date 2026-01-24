import React, { useState, useEffect, useLayoutEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CookCard, PantryMatch, Ingredient } from '../types/CookCard';
import { logIngressEvent } from '../services/telemetry';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

interface CookCardScreenProps {
  route?: {
    params?: {
      cookCard?: CookCard;
      cookCardId?: string;
      recipeDatabaseId?: string;
      mode?: 'normal' | 'needs_ingredients';
      sessionId?: string;
    };
  };
  cookCard?: CookCard;
  mode?: 'normal' | 'needs_ingredients';
  sessionId?: string;
  onSave?: () => void;
  onCook?: () => void;
  onAddToShoppingList?: () => void;
}

export const CookCardScreen: React.FC<CookCardScreenProps> = (props) => {
  const navigation = useNavigation();
  const { householdId, user } = useAuth();
  const userId = user?.id;

  // Route params
  const cookCardId = props.route?.params?.cookCardId;
  const recipeDatabaseId = props.route?.params?.recipeDatabaseId;
  const mode = props.route?.params?.mode || props.mode || 'normal';
  const sessionId = props.route?.params?.sessionId || props.sessionId;
  const { onSave, onCook, onAddToShoppingList } = props;

  // State
  const [cookCard, setCookCard] = useState<CookCard | null>(
    props.route?.params?.cookCard || props.cookCard || null
  );
  const [loading, setLoading] = useState(false);
  const [isFromDatabase, setIsFromDatabase] = useState(!!recipeDatabaseId);
  const [pantryMatch, setPantryMatch] = useState<PantryMatch | null>(null);
  const [saved, setSaved] = useState(false);
  const [showShoppingListModal, setShowShoppingListModal] = useState(false);
  const [selectedOptionalIngredients, setSelectedOptionalIngredients] = useState<Set<string>>(new Set());

  // NEW: Serving scaler
  const [servingMultiplier, setServingMultiplier] = useState(1);
  const baseServings = cookCard?.servings || 4;
  const currentServings = Math.round(baseServings * servingMultiplier);

  // NEW: Completed steps tracking
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());

  // Load cook card data
  useEffect(() => {
    const loadCookCard = async () => {
      if (cookCard) return;

      if (!cookCardId && !recipeDatabaseId) {
        console.error('[CookCard] No cook card, cookCardId, or recipeDatabaseId provided');
        return;
      }

      setLoading(true);

      try {
        if (recipeDatabaseId) {
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

          const transformedCookCard: CookCard = {
            id: recipe.id,
            version: '1.0',
            source: {
              url: recipe.source_url || '',
              platform: recipe.platform || 'web',
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
              : { type: 'link_only' },
            ingredients: (recipe.ingredients || []).map((ing: any, index: number) => ({
              name: ing.ingredient_name,
              normalized_name: ing.normalized_name || undefined,
              canonical_item_id: ing.canonical_item_id || undefined,
              amount: ing.amount || undefined,
              unit: ing.unit || undefined,
              preparation: ing.preparation || undefined,
              confidence: 1.0,
              provenance: 'creator_provided',
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

  // Track if we've calculated pantry match for this cook card
  const [pantryMatchCalculated, setPantryMatchCalculated] = useState(false);

  useEffect(() => {
    // Only calculate once per cook card load, not on every update
    if (cookCard && !pantryMatchCalculated) {
      calculatePantryMatch();
      setPantryMatchCalculated(true);
    }
  }, [cookCard, pantryMatchCalculated]);

  // Scale ingredient amount based on serving multiplier
  const scaleAmount = (amount: number | string | undefined): string => {
    if (!amount) return '';
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (isNaN(numAmount)) return String(amount);

    const scaled = numAmount * servingMultiplier;
    // Format nicely: remove trailing zeros, use fractions for common values
    if (scaled === Math.floor(scaled)) {
      return String(scaled);
    }
    return scaled.toFixed(1).replace(/\.0$/, '');
  };

  // Get scaled ingredients
  const scaledIngredients = useMemo(() => {
    if (!cookCard?.ingredients) return [];
    return cookCard.ingredients.map(ing => ({
      ...ing,
      scaledAmount: scaleAmount(ing.amount),
    }));
  }, [cookCard?.ingredients, servingMultiplier]);

  const handleDelete = () => {
    if (!cookCard?.id) {
      Alert.alert('Error', 'Cannot delete this recipe');
      return;
    }

    Alert.alert(
      'Delete Recipe',
      `Are you sure you want to delete "${cookCard.title}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('cook_cards')
                .delete()
                .eq('id', cookCard.id);

              if (error) throw error;

              Alert.alert('Deleted', 'Recipe has been deleted.', [
                {
                  text: 'OK',
                  onPress: () => {
                    if (navigation.canGoBack()) {
                      navigation.goBack();
                    }
                  },
                },
              ]);
            } catch (error) {
              console.error('Failed to delete recipe:', error);
              Alert.alert('Error', 'Failed to delete recipe. Please try again.');
            }
          },
        },
      ]
    );
  };

  const handleAddMissingToShoppingList = async () => {
    if (!pantryMatch || pantryMatch.need === 0) {
      Alert.alert('Nothing to Add', 'You have all the ingredients!');
      return;
    }

    const requiredMissing = pantryMatch.missing_ingredients.filter(ing => !ing.is_optional);
    const optionalMissing = pantryMatch.missing_ingredients.filter(ing => ing.is_optional);

    if (optionalMissing.length === 0) {
      await confirmAddToShoppingList(requiredMissing.map(ing => ing.name));
      return;
    }

    setSelectedOptionalIngredients(new Set());
    setShowShoppingListModal(true);
  };

  const confirmAddToShoppingList = async (ingredientNames: string[]) => {
    if (!userId) {
      Alert.alert('Error', 'You must be logged in');
      return;
    }

    try {
      let activeHouseholdId = householdId;

      if (!activeHouseholdId) {
        const { data: newHouseholdId, error } = await supabase.rpc('get_or_create_household');
        if (error || !newHouseholdId) {
          Alert.alert('Setup Required', 'Please complete your profile setup.');
          return;
        }
        activeHouseholdId = newHouseholdId;
      }

      const { addIngredientsToShoppingList } = await import('../services/shoppingListService');

      const ingredientObjects = ingredientNames.map(name => {
        const matchingIngredient = cookCard?.ingredients.find(ing => ing.name === name);
        return matchingIngredient ? {
          name: matchingIngredient.name,
          is_optional: matchingIngredient.is_optional
        } : name;
      });

      const result = await addIngredientsToShoppingList(
        ingredientObjects,
        activeHouseholdId,
        cookCard?.id,
        cookCard?.title
      );

      if (result.added > 0) {
        const message = result.duplicates > 0
          ? `Added ${result.added} item${result.added > 1 ? 's' : ''} (${result.duplicates} already in list)`
          : `Added ${result.added} item${result.added > 1 ? 's' : ''}`;
        Alert.alert('Added to Shopping List', message);
      } else {
        Alert.alert('Already Added', 'All items are already in your shopping list.');
      }
    } catch (error) {
      console.error('Failed to add to shopping list:', error);
      Alert.alert('Error', 'Failed to add items to shopping list');
    }
  };

  const calculatePantryMatch = async () => {
    if (!userId || !householdId || !cookCard) return;

    try {
      // First, let's see ALL pantry items to debug
      const { data: allPantryItems, error: debugError } = await supabase
        .from('pantry_items')
        .select('id, name, canonical_item_id, status, quantity')
        .eq('household_id', householdId)
        .order('created_at', { ascending: false })
        .limit(10);

      console.log('[PantryMatch] DEBUG - Recent pantry items (all statuses):');
      allPantryItems?.forEach(item => {
        console.log(`  - "${item.name}" | status: ${item.status} | qty: ${item.quantity} | canonical: ${item.canonical_item_id || 'NONE'}`);
      });

      const { data: pantryItems, error } = await supabase
        .from('pantry_items')
        .select('canonical_item_id, name')
        .eq('household_id', householdId)
        .eq('status', 'active')
        .gte('quantity', 0.01);

      if (error) {
        console.error('Error fetching pantry:', error);
        return;
      }

      // Debug: Log pantry items with canonical IDs
      const pantryWithCanonical = pantryItems?.filter(item => item.canonical_item_id) || [];
      console.log(`[PantryMatch] Found ${pantryItems?.length || 0} pantry items, ${pantryWithCanonical.length} with canonical IDs`);
      pantryWithCanonical.forEach(item => {
        console.log(`  - Pantry: "${item.name}" → canonical: ${item.canonical_item_id}`);
      });

      const pantryCanonicalIds = new Set(
        pantryItems?.map(item => item.canonical_item_id).filter(Boolean) || []
      );

      // Debug: Log recipe ingredients with canonical IDs
      const ingredientsWithCanonical = cookCard.ingredients.filter(ing => ing.canonical_item_id);
      console.log(`[PantryMatch] Recipe has ${cookCard.ingredients.length} ingredients, ${ingredientsWithCanonical.length} with canonical IDs`);
      cookCard.ingredients.forEach(ing => {
        console.log(`  - Recipe: "${ing.name}" → canonical: ${ing.canonical_item_id || 'NONE'}`);
      });

      const updatedIngredients = cookCard.ingredients.map(ing => ({
        ...ing,
        in_pantry: ing.canonical_item_id ? pantryCanonicalIds.has(ing.canonical_item_id) : false,
      }));

      const requiredIngredients = updatedIngredients.filter(ing => !ing.is_optional);
      const optionalIngredients = updatedIngredients.filter(ing => ing.is_optional);

      const available = requiredIngredients.filter(ing => ing.in_pantry);
      const missing = requiredIngredients.filter(ing => !ing.in_pantry);
      const missingOptionals = optionalIngredients.filter(ing => !ing.in_pantry);

      const matchPercentage = requiredIngredients.length > 0
        ? (available.length / requiredIngredients.length) * 100
        : 0;

      setPantryMatch({
        have: available.length,
        need: missing.length,
        match_percentage: Math.round(matchPercentage),
        missing_ingredients: [...missing, ...missingOptionals],
        available_ingredients: available,
      });

      // Update cookCard state to trigger re-render with in_pantry flags
      setCookCard(prev => prev ? { ...prev, ingredients: updatedIngredients } : prev);
    } catch (error) {
      console.error('Error calculating pantry match:', error);
    }
  };

  const formatTime = (minutes?: number): string => {
    if (!minutes) return '-';
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  const toggleStep = (stepNumber: number) => {
    const newCompleted = new Set(completedSteps);
    if (newCompleted.has(stepNumber)) {
      newCompleted.delete(stepNumber);
    } else {
      newCompleted.add(stepNumber);
    }
    setCompletedSteps(newCompleted);
  };

  // Loading state
  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color="#1F7A3B" />
        <Text style={styles.loadingText}>Loading recipe...</Text>
      </View>
    );
  }

  // Error state
  if (!cookCard) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <Text style={styles.errorText}>No recipe data</Text>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.canGoBack() && navigation.goBack()}
        >
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const getSourceBadge = () => {
    if (cookCard.extraction?.method === 'user_manual') {
      return { icon: '✏️', label: 'My Recipe' };
    }
    if (cookCard.source?.url?.includes('xiaohongshu.com') || cookCard.source?.url?.includes('xhslink.com')) {
      return { icon: '📕', label: '小红书' };
    }
    switch (cookCard.source?.platform) {
      case 'youtube': return { icon: '▶️', label: 'YouTube' };
      case 'tiktok': return { icon: '🎵', label: 'TikTok' };
      case 'instagram': return { icon: '📷', label: 'Instagram' };
      default: return { icon: '🌐', label: 'Web' };
    }
  };

  const sourceBadge = getSourceBadge();
  const totalIngredients = cookCard.ingredients.filter(i => !i.is_optional).length;
  const haveCount = pantryMatch?.have || 0;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.canGoBack() && navigation.goBack()}
          style={styles.closeButton}
        >
          <Ionicons name="close" size={28} color="#111111" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{sourceBadge.icon} {sourceBadge.label}</Text>
        <TouchableOpacity
          onPress={handleDelete}
          style={styles.deleteButton}
        >
          <Ionicons name="trash-outline" size={22} color="#EF4444" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Title */}
        <Text style={styles.title}>{cookCard.title}</Text>

        {/* Quick Stats Bar */}
        <View style={styles.statsBar}>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Prep</Text>
            <Text style={styles.statValue}>{formatTime(cookCard.prep_time_minutes)}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Cook</Text>
            <Text style={styles.statValue}>{formatTime(cookCard.cook_time_minutes)}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Total</Text>
            <Text style={styles.statValue}>{formatTime(cookCard.total_time_minutes)}</Text>
          </View>
          <View style={styles.statDivider} />
          {/* Serving Scaler */}
          <View style={styles.servingControl}>
            <Text style={styles.statLabel}>Servings</Text>
            <View style={styles.servingStepper}>
              <TouchableOpacity
                onPress={() => setServingMultiplier(Math.max(0.5, servingMultiplier - 0.5))}
                style={styles.stepperButton}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="remove" size={14} color="#1F7A3B" />
              </TouchableOpacity>
              <Text style={styles.servingValue}>{currentServings}</Text>
              <TouchableOpacity
                onPress={() => setServingMultiplier(servingMultiplier + 0.5)}
                style={styles.stepperButton}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="add" size={14} color="#1F7A3B" />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Pantry Match Indicator */}
        {pantryMatch && totalIngredients > 0 && (
          <View style={styles.pantryIndicator}>
            <View style={styles.pantryProgress}>
              <View
                style={[
                  styles.pantryProgressFill,
                  { width: `${(haveCount / totalIngredients) * 100}%` }
                ]}
              />
            </View>
            <Text style={styles.pantryText}>
              You have <Text style={styles.pantryBold}>{haveCount}/{totalIngredients}</Text> ingredients
            </Text>
          </View>
        )}

        {/* Ingredients Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>INGREDIENTS</Text>
            {pantryMatch && pantryMatch.need > 0 && (
              <TouchableOpacity
                onPress={handleAddMissingToShoppingList}
                style={styles.sectionAction}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="cart-outline" size={16} color="#1F7A3B" />
                <Text style={styles.sectionActionText}>Add missing</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.ingredientsList}>
            {scaledIngredients
              .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
              .map((ingredient, index) => (
                <View key={`${ingredient.name}-${index}`} style={styles.ingredientRow}>
                  {ingredient.in_pantry ? (
                    <Ionicons name="checkmark-circle" size={18} color="#1F7A3B" style={styles.ingredientIcon} />
                  ) : (
                    <Ionicons name="ellipse-outline" size={18} color="#9CA3AF" style={styles.ingredientIcon} />
                  )}
                  <Text style={[
                    styles.ingredientName,
                    ingredient.in_pantry && styles.ingredientInPantry
                  ]} numberOfLines={1}>
                    {ingredient.name}
                    {ingredient.preparation ? <Text style={styles.ingredientPrep}>, {ingredient.preparation}</Text> : null}
                    {ingredient.is_optional ? <Text style={styles.optionalLabel}> (optional)</Text> : null}
                  </Text>
                  {(ingredient.scaledAmount || ingredient.unit) && (
                    <Text style={styles.ingredientQty}>
                      {ingredient.scaledAmount}{ingredient.unit ? ` ${ingredient.unit}` : ''}
                    </Text>
                  )}
                </View>
              ))}
          </View>
        </View>

        {/* Instructions Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>INSTRUCTIONS</Text>

          {(cookCard.instructions?.type === 'creator_provided' ||
            cookCard.instructions?.type === 'user_notes' ||
            cookCard.instructions?.type === 'steps') &&
           cookCard.instructions?.steps &&
           cookCard.instructions.steps.length > 0 ? (
            <View style={styles.instructionsList}>
              {cookCard.instructions.steps.map((step, index) => {
                const stepNum = step.step_number || index + 1;
                const isCompleted = completedSteps.has(stepNum);

                return (
                  <TouchableOpacity
                    key={index}
                    style={[styles.instructionCard, isCompleted && styles.instructionCardCompleted]}
                    onPress={() => toggleStep(stepNum)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.stepBadge, isCompleted && styles.stepBadgeCompleted]}>
                      {isCompleted ? (
                        <Ionicons name="checkmark" size={12} color="#fff" />
                      ) : (
                        <Text style={styles.stepBadgeText}>{stepNum}</Text>
                      )}
                    </View>
                    <Text style={[styles.instructionText, isCompleted && styles.instructionTextCompleted]}>
                      {step.instruction}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <View style={styles.noInstructions}>
              <Text style={styles.noInstructionsText}>
                {cookCard.source?.url && !cookCard.source.url.startsWith('manual://')
                  ? 'View the original source for full instructions'
                  : 'No instructions added yet'}
              </Text>
              {cookCard.source?.url && !cookCard.source.url.startsWith('manual://') && (
                <TouchableOpacity
                  style={styles.viewSourceButton}
                  onPress={() => Alert.alert('Source', cookCard.source.url)}
                >
                  <Ionicons name="open-outline" size={18} color="#1F7A3B" />
                  <Text style={styles.viewSourceText}>View Original</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* Bottom spacing */}
        <View style={{ height: 40 }} />
      </ScrollView>

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

            <ScrollView style={styles.modalScroll}>
              {pantryMatch && pantryMatch.missing_ingredients.filter(ing => !ing.is_optional).length > 0 && (
                <>
                  <Text style={styles.modalSectionTitle}>Required</Text>
                  {pantryMatch.missing_ingredients.filter(ing => !ing.is_optional).map((ingredient) => (
                    <View key={ingredient.name} style={styles.modalIngredientRow}>
                      <Ionicons name="checkmark-circle" size={20} color="#1F7A3B" />
                      <Text style={styles.modalIngredientText}>{ingredient.name}</Text>
                    </View>
                  ))}
                </>
              )}

              {pantryMatch && pantryMatch.missing_ingredients.filter(ing => ing.is_optional).length > 0 && (
                <>
                  <Text style={styles.modalSectionTitle}>Optional</Text>
                  {pantryMatch.missing_ingredients.filter(ing => ing.is_optional).map((ingredient) => (
                    <TouchableOpacity
                      key={ingredient.name}
                      style={styles.modalIngredientRow}
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
                        color={selectedOptionalIngredients.has(ingredient.name) ? '#1F7A3B' : '#9CA3AF'}
                      />
                      <Text style={styles.modalIngredientText}>{ingredient.name}</Text>
                    </TouchableOpacity>
                  ))}
                </>
              )}
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setShowShoppingListModal(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalAddButton}
                onPress={async () => {
                  if (!pantryMatch) return;
                  const requiredNames = pantryMatch.missing_ingredients
                    .filter(ing => !ing.is_optional)
                    .map(ing => ing.name);
                  const allIngredients = [...requiredNames, ...Array.from(selectedOptionalIngredients)];
                  setShowShoppingListModal(false);
                  await confirmAddToShoppingList(allIngredients);
                }}
              >
                <Text style={styles.modalAddText}>
                  Add {(pantryMatch?.missing_ingredients.filter(ing => !ing.is_optional).length || 0) + selectedOptionalIngredients.size} items
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFBFC',
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
  },
  backButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },

  // Header - matches ManualRecipeEntryScreen
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  closeButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: -8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111111',
  },
  deleteButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: -8,
  },

  // Scroll content
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },

  // Title
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111111',
    marginBottom: 20,
    lineHeight: 34,
  },

  // Quick Stats Bar
  statsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111111',
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: '#E5E7EB',
  },
  servingControl: {
    alignItems: 'center',
    flex: 1.2,
  },
  servingStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stepperButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#E8F5EC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  servingValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111111',
    minWidth: 20,
    textAlign: 'center',
  },

  // Pantry Indicator
  pantryIndicator: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  pantryProgress: {
    height: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: 4,
    marginBottom: 10,
    overflow: 'hidden',
  },
  pantryProgressFill: {
    height: '100%',
    backgroundColor: '#1F7A3B',
    borderRadius: 4,
  },
  pantryText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
  pantryBold: {
    fontWeight: '700',
    color: '#111111',
  },

  // Section
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6B7280',
    letterSpacing: 1,
    marginBottom: 12,
  },
  sectionAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  sectionActionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1F7A3B',
  },

  // Ingredients List
  ingredientsList: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
  },
  ingredientIcon: {
    marginRight: 10,
    width: 18,
  },
  bullet: {
    fontSize: 14,
    color: '#1F7A3B',
    marginRight: 10,
  },
  ingredientName: {
    flex: 1,
    fontSize: 15,
    color: '#111111',
  },
  ingredientInPantry: {
    color: '#1F7A3B',
  },
  ingredientPrep: {
    color: '#6B7280',
  },
  ingredientQty: {
    fontSize: 14,
    color: '#6B7280',
    marginLeft: 12,
    marginRight: 4,
  },
  optionalLabel: {
    color: '#9CA3AF',
    fontStyle: 'italic',
  },

  // Instructions List
  instructionsList: {
    gap: 10,
  },
  instructionCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  instructionCardCompleted: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  stepBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#1F7A3B',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  stepBadgeCompleted: {
    backgroundColor: '#16A34A',
  },
  stepBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  instructionText: {
    flex: 1,
    fontSize: 15,
    color: '#111111',
    lineHeight: 22,
  },
  instructionTextCompleted: {
    color: '#6B7280',
  },
  noInstructions: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
  },
  noInstructionsText: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    marginBottom: 12,
  },
  viewSourceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#E8F5EC',
    borderRadius: 8,
  },
  viewSourceText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F7A3B',
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    maxHeight: '70%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111111',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalScroll: {
    maxHeight: 300,
  },
  modalSectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 16,
    marginBottom: 8,
  },
  modalIngredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  modalIngredientText: {
    fontSize: 16,
    color: '#111111',
    flex: 1,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },
  modalAddButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#1F7A3B',
    alignItems: 'center',
  },
  modalAddText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
