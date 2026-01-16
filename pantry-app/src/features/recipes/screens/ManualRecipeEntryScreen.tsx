/**
 * ManualRecipeEntryScreen - Structured manual recipe entry
 *
 * V1 Feature: Users can add recipes manually without credits
 * Fields:
 *   - Title (required)
 *   - Ingredients (line item inputs)
 *   - Instructions (numbered line item inputs)
 *   - Details: prep time, cook time, servings (optional)
 *   - Notes (optional)
 *   - Source URL (optional, at bottom)
 */

import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  Pressable,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../../core/constants/theme';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../lib/supabase';

interface IngredientInput {
  name: string;
  qty: string;
}

// Parse quantity string into amount and unit
const parseQuantity = (qtyText: string): { amount: number | null; unit: string | null } => {
  if (!qtyText.trim()) return { amount: null, unit: null };

  // Try to extract leading number: "2 cups" → 2, "1/2 tsp" → 0.5
  const match = qtyText.match(/^([\d\/\.]+)\s*(.*)$/);
  if (match) {
    let amount: number;
    const numStr = match[1];

    // Handle fractions like "1/2"
    if (numStr.includes('/')) {
      const [num, denom] = numStr.split('/');
      amount = parseFloat(num) / parseFloat(denom);
    } else {
      amount = parseFloat(numStr);
    }

    const unit = match[2].trim() || null;
    return { amount: isNaN(amount) ? null : amount, unit };
  }

  // No number found: "to taste" → { amount: null, unit: "to taste" }
  return { amount: null, unit: qtyText.trim() };
};

export default function ManualRecipeEntryScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();

  // Form state
  const [title, setTitle] = useState('');
  const [ingredients, setIngredients] = useState<IngredientInput[]>([{ name: '', qty: '' }]);
  const [instructions, setInstructions] = useState<string[]>(['']);
  const [prepTime, setPrepTime] = useState('');
  const [cookTime, setCookTime] = useState('');
  const [servings, setServings] = useState('');
  const [notes, setNotes] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [saving, setSaving] = useState(false);

  // Refs for auto-focus
  const ingredientNameRefs = useRef<(TextInput | null)[]>([]);
  const ingredientQtyRefs = useRef<(TextInput | null)[]>([]);
  const instructionRefs = useRef<(TextInput | null)[]>([]);

  // Ingredient handlers
  const addIngredient = () => {
    setIngredients([...ingredients, { name: '', qty: '' }]);
    setTimeout(() => {
      ingredientNameRefs.current[ingredients.length]?.focus();
    }, 100);
  };

  const updateIngredientName = (index: number, value: string) => {
    const updated = [...ingredients];
    updated[index] = { ...updated[index], name: value };
    setIngredients(updated);
  };

  const updateIngredientQty = (index: number, value: string) => {
    const updated = [...ingredients];
    updated[index] = { ...updated[index], qty: value };
    setIngredients(updated);
  };

  const removeIngredient = (index: number) => {
    if (ingredients.length === 1) {
      setIngredients([{ name: '', qty: '' }]);
      return;
    }
    setIngredients(ingredients.filter((_, i) => i !== index));
  };

  const handleIngredientNameSubmit = (index: number) => {
    // Move to quantity field
    ingredientQtyRefs.current[index]?.focus();
  };

  const handleIngredientQtySubmit = (index: number) => {
    // If this ingredient has a name and it's the last one, add new ingredient
    if (ingredients[index].name.trim() && index === ingredients.length - 1) {
      addIngredient();
    } else if (index < ingredients.length - 1) {
      // Move to next ingredient's name field
      ingredientNameRefs.current[index + 1]?.focus();
    }
  };

  // Instruction handlers
  const addInstruction = () => {
    setInstructions([...instructions, '']);
    setTimeout(() => {
      instructionRefs.current[instructions.length]?.focus();
    }, 100);
  };

  const updateInstruction = (index: number, value: string) => {
    const updated = [...instructions];
    updated[index] = value;
    setInstructions(updated);
  };

  const removeInstruction = (index: number) => {
    if (instructions.length === 1) {
      setInstructions(['']);
      return;
    }
    setInstructions(instructions.filter((_, i) => i !== index));
  };

  const handleInstructionSubmit = (index: number) => {
    if (instructions[index].trim() && index === instructions.length - 1) {
      addInstruction();
    } else if (index < instructions.length - 1) {
      instructionRefs.current[index + 1]?.focus();
    }
  };

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert('Title Required', 'Please enter a recipe title.');
      return;
    }

    if (!user?.id) {
      Alert.alert('Error', 'You must be logged in to save recipes.');
      return;
    }

    setSaving(true);

    try {
      // Filter out empty entries - only keep ingredients with a name
      const filteredIngredients = ingredients.filter(i => i.name.trim().length > 0);

      const filteredInstructions = instructions
        .map(i => i.trim())
        .filter(i => i.length > 0);

      // Calculate total time
      const prepMins = parseInt(prepTime) || 0;
      const cookMins = parseInt(cookTime) || 0;
      const totalMins = prepMins + cookMins || null;

      // Build instructions JSON for structured steps
      const instructionsJson = filteredInstructions.length > 0
        ? filteredInstructions.map((text, index) => ({
            step_number: index + 1,
            instruction: text,
          }))
        : null;

      // Generate unique source_url for manual entries (UNIQUE constraint)
      const manualSourceUrl = sourceUrl.trim() || `manual://${user.id}/${Date.now()}`;

      // Save to cook_cards table
      const { data: cookCard, error: cardError } = await supabase
        .from('cook_cards')
        .insert({
          user_id: user.id,
          title: title.trim(),
          source_url: manualSourceUrl,
          description: notes.trim() || null,
          platform: 'web',  // Closest match for manual entries
          extraction_method: 'user_manual',  // Must match DB constraint
          extraction_confidence: 1.0,
          is_archived: false,
          prep_time_minutes: prepMins || null,
          cook_time_minutes: cookMins || null,
          total_time_minutes: totalMins,
          servings: parseInt(servings) || null,
          instructions_type: filteredInstructions.length > 0 ? 'user_notes' : 'link_only',
          instructions_json: instructionsJson,
        })
        .select()
        .single();

      if (cardError) throw cardError;

      // Save ingredients if provided
      if (filteredIngredients.length > 0 && cookCard) {
        const ingredientRecords = filteredIngredients.map((ing, index) => {
          const { amount, unit } = parseQuantity(ing.qty);
          return {
            cook_card_id: cookCard.id,
            ingredient_name: ing.name.trim(),
            normalized_name: ing.name.trim().toLowerCase(),
            amount: amount,      // DB column name
            unit: unit,          // DB column name
            sort_order: index,
            confidence: 1.0,
            provenance: 'user_edited',  // Must match DB constraint
          };
        });

        const { error: ingredientsError } = await supabase
          .from('cook_card_ingredients')
          .insert(ingredientRecords);

        if (ingredientsError) {
          console.error('Error saving ingredients:', ingredientsError);
        }
      }

      Alert.alert(
        'Recipe Saved',
        `"${title}" has been added to your recipes.`,
        [
          {
            text: 'OK',
            onPress: () => navigation.goBack(),
          },
        ]
      );
    } catch (error) {
      console.error('Error saving recipe:', error);
      Alert.alert('Error', 'Failed to save recipe. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    const hasContent = title.trim() ||
      ingredients.some(i => i.name.trim()) ||
      instructions.some(i => i.trim()) ||
      notes.trim();

    if (hasContent) {
      Alert.alert(
        'Discard Changes?',
        'You have unsaved changes. Are you sure you want to discard them?',
        [
          { text: 'Keep Editing', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: () => navigation.goBack() },
        ]
      );
    } else {
      navigation.goBack();
    }
  };

  const renderIngredientItem = (ingredient: IngredientInput, index: number) => (
    <View key={`ing-${index}`} style={styles.ingredientRow}>
      <TextInput
        ref={ref => ingredientNameRefs.current[index] = ref}
        style={styles.ingredientNameInput}
        placeholder={index === 0 ? "e.g., flour" : "Ingredient"}
        placeholderTextColor={theme.colors.textSecondary}
        value={ingredient.name}
        onChangeText={(text) => updateIngredientName(index, text)}
        onSubmitEditing={() => handleIngredientNameSubmit(index)}
        returnKeyType="next"
        blurOnSubmit={false}
      />
      <TextInput
        ref={ref => ingredientQtyRefs.current[index] = ref}
        style={styles.ingredientQtyInput}
        placeholder="2 cups"
        placeholderTextColor={theme.colors.textSecondary}
        value={ingredient.qty}
        onChangeText={(text) => updateIngredientQty(index, text)}
        onSubmitEditing={() => handleIngredientQtySubmit(index)}
        returnKeyType="next"
        blurOnSubmit={false}
      />
      <Pressable
        onPress={() => removeIngredient(index)}
        style={styles.removeButton}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons name="close-circle" size={22} color={theme.colors.textSecondary} />
      </Pressable>
    </View>
  );

  const renderInstructionItem = (instruction: string, index: number) => (
    <View key={`inst-${index}`} style={styles.instructionRow}>
      <View style={styles.stepNumber}>
        <Text style={styles.stepNumberText}>{index + 1}</Text>
      </View>
      <TextInput
        ref={ref => instructionRefs.current[index] = ref}
        style={styles.instructionInput}
        placeholder={index === 0 ? "e.g., Preheat oven to 350°F" : "Next step..."}
        placeholderTextColor={theme.colors.textSecondary}
        value={instruction}
        onChangeText={(text) => updateInstruction(index, text)}
        onSubmitEditing={() => handleInstructionSubmit(index)}
        returnKeyType="next"
        blurOnSubmit={false}
        multiline
      />
      <Pressable
        onPress={() => removeInstruction(index)}
        style={styles.removeButton}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons name="close-circle" size={22} color={theme.colors.textSecondary} />
      </Pressable>
    </View>
  );

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        {/* Header - closer to top */}
        <View style={styles.header}>
          <Pressable onPress={handleClose} style={styles.closeButton}>
            <Ionicons name="close" size={28} color={theme.colors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Add Recipe</Text>
          <Pressable
            onPress={handleSave}
            style={[styles.saveButton, (!title.trim() || saving) && styles.saveButtonDisabled]}
            disabled={saving || !title.trim()}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.saveButtonText}>Save</Text>
            )}
          </Pressable>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Title Field */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recipe Title</Text>
            <TextInput
              style={styles.titleInput}
              placeholder="What's this recipe called?"
              placeholderTextColor={theme.colors.textSecondary}
              value={title}
              onChangeText={setTitle}
              autoCapitalize="words"
              returnKeyType="next"
            />
          </View>

          {/* Ingredients Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Ingredients</Text>
            <View style={styles.lineItemsContainer}>
              {ingredients.map((ing, index) => renderIngredientItem(ing, index))}
            </View>
            <Pressable onPress={addIngredient} style={styles.addButton}>
              <Ionicons name="add" size={20} color={theme.colors.primary} />
              <Text style={styles.addButtonText}>Add ingredient</Text>
            </Pressable>
          </View>

          {/* Instructions Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Instructions</Text>
            <View style={styles.lineItemsContainer}>
              {instructions.map((inst, index) => renderInstructionItem(inst, index))}
            </View>
            <Pressable onPress={addInstruction} style={styles.addButton}>
              <Ionicons name="add" size={20} color={theme.colors.primary} />
              <Text style={styles.addButtonText}>Add step</Text>
            </Pressable>
          </View>

          {/* Details Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Details (optional)</Text>
            <View style={styles.detailsRow}>
              <View style={styles.detailField}>
                <Text style={styles.detailLabel}>Prep</Text>
                <View style={styles.detailInputRow}>
                  <TextInput
                    style={styles.detailInput}
                    placeholder="15"
                    placeholderTextColor={theme.colors.textSecondary}
                    value={prepTime}
                    onChangeText={setPrepTime}
                    keyboardType="number-pad"
                    maxLength={3}
                  />
                  <Text style={styles.detailUnit}>min</Text>
                </View>
              </View>
              <View style={styles.detailField}>
                <Text style={styles.detailLabel}>Cook</Text>
                <View style={styles.detailInputRow}>
                  <TextInput
                    style={styles.detailInput}
                    placeholder="30"
                    placeholderTextColor={theme.colors.textSecondary}
                    value={cookTime}
                    onChangeText={setCookTime}
                    keyboardType="number-pad"
                    maxLength={3}
                  />
                  <Text style={styles.detailUnit}>min</Text>
                </View>
              </View>
              <View style={styles.detailField}>
                <Text style={styles.detailLabel}>Servings</Text>
                <TextInput
                  style={styles.detailInput}
                  placeholder="4"
                  placeholderTextColor={theme.colors.textSecondary}
                  value={servings}
                  onChangeText={setServings}
                  keyboardType="number-pad"
                  maxLength={2}
                />
              </View>
            </View>
          </View>

          {/* Notes Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Notes (optional)</Text>
            <TextInput
              style={[styles.textInput, styles.textArea]}
              placeholder="Tips, variations, or special memories..."
              placeholderTextColor={theme.colors.textSecondary}
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>

          {/* Source URL Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Source URL (optional)</Text>
            <TextInput
              style={styles.textInput}
              placeholder="https://..."
              placeholderTextColor={theme.colors.textSecondary}
              value={sourceUrl}
              onChangeText={setSourceUrl}
              keyboardType="url"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.fieldHint}>
              If you found this recipe online
            </Text>
          </View>

          {/* Info Card */}
          <View style={styles.infoCard}>
            <Ionicons name="information-circle-outline" size={20} color={theme.colors.primary} />
            <Text style={styles.infoText}>
              Manual entries are free and don't use credits. You can edit or delete recipes anytime.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFBFC',
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: '#fff',
  },
  closeButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: -8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.text,
  },
  saveButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  titleInput: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.text,
  },
  lineItemsContainer: {
    gap: 8,
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    paddingLeft: 16,
    paddingRight: 8,
  },
  ingredientNameInput: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 16,
    color: theme.colors.text,
  },
  ingredientQtyInput: {
    width: 80,
    paddingVertical: 14,
    paddingHorizontal: 8,
    fontSize: 16,
    color: theme.colors.text,
    borderLeftWidth: 1,
    borderLeftColor: theme.colors.border,
    textAlign: 'center',
  },
  instructionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    paddingRight: 8,
    paddingVertical: 4,
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
    marginTop: 10,
  },
  stepNumberText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  instructionInput: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    fontSize: 16,
    color: theme.colors.text,
    minHeight: 48,
  },
  removeButton: {
    padding: 8,
    justifyContent: 'center',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    marginTop: 8,
    borderWidth: 2,
    borderColor: theme.colors.primary + '40',
    borderStyle: 'dashed',
    borderRadius: 12,
    backgroundColor: theme.colors.primary + '08',
  },
  addButtonText: {
    color: theme.colors.primary,
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 6,
  },
  detailsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  detailField: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    marginBottom: 6,
  },
  detailInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailInput: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: theme.colors.text,
    textAlign: 'center',
    minWidth: 60,
  },
  detailUnit: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginLeft: 6,
  },
  textInput: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: theme.colors.text,
  },
  textArea: {
    minHeight: 80,
    paddingTop: 14,
  },
  fieldHint: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginTop: 6,
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: '#F0F9F6',
    borderRadius: 12,
    padding: 16,
    gap: 12,
    alignItems: 'flex-start',
    marginTop: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: theme.colors.text,
    lineHeight: 20,
  },
});
