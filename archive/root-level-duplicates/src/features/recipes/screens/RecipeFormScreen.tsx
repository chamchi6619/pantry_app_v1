import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Dimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { theme } from '../../../core/constants/theme';
import { useEnhancedRecipeStore } from '../../../stores/enhancedRecipeStore';
import { ingredientParser } from '../utils/ingredientParser';
import { RecipeCategory } from '../types';

const { width: screenWidth } = Dimensions.get('window');

const categories: RecipeCategory[] = ['quick', 'healthy', 'comfort', 'dinner', 'breakfast', 'lunch', 'dessert'];
const difficulties = ['easy', 'medium', 'hard'] as const;

export const RecipeFormScreen: React.FC = () => {
  const navigation = useNavigation();
  const addRecipe = useEnhancedRecipeStore(state => state.addRecipe);
  const scrollViewRef = useRef<ScrollView>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<RecipeCategory>('quick');
  const [prepTime, setPrepTime] = useState('');
  const [cookTime, setCookTime] = useState('');
  const [servings, setServings] = useState('4');
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('easy');
  const [ingredients, setIngredients] = useState(['']);
  const [instructions, setInstructions] = useState(['']);
  const [tags, setTags] = useState('');
  const [imageUrl, setImageUrl] = useState('');

  React.useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true
    }).start();
  }, []);

  const addIngredientField = () => {
    setIngredients([...ingredients, '']);
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  const updateIngredient = (index: number, value: string) => {
    const newIngredients = [...ingredients];
    newIngredients[index] = value;
    setIngredients(newIngredients);
  };

  const removeIngredient = (index: number) => {
    if (ingredients.length > 1) {
      setIngredients(ingredients.filter((_, i) => i !== index));
    }
  };

  const addInstructionField = () => {
    setInstructions([...instructions, '']);
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  const updateInstruction = (index: number, value: string) => {
    const newInstructions = [...instructions];
    newInstructions[index] = value;
    setInstructions(newInstructions);
  };

  const removeInstruction = (index: number) => {
    if (instructions.length > 1) {
      setInstructions(instructions.filter((_, i) => i !== index));
    }
  };

  const validateForm = () => {
    if (!name.trim()) {
      Alert.alert('Missing Information', 'Please enter a recipe name');
      return false;
    }
    if (!description.trim()) {
      Alert.alert('Missing Information', 'Please enter a description');
      return false;
    }
    if (!prepTime || isNaN(Number(prepTime))) {
      Alert.alert('Invalid Input', 'Please enter a valid prep time in minutes');
      return false;
    }
    if (!cookTime || isNaN(Number(cookTime))) {
      Alert.alert('Invalid Input', 'Please enter a valid cook time in minutes');
      return false;
    }
    if (!servings || isNaN(Number(servings))) {
      Alert.alert('Invalid Input', 'Please enter a valid number of servings');
      return false;
    }

    const validIngredients = ingredients.filter(ing => ing.trim());
    if (validIngredients.length === 0) {
      Alert.alert('Missing Information', 'Please add at least one ingredient');
      return false;
    }

    const validInstructions = instructions.filter(inst => inst.trim());
    if (validInstructions.length === 0) {
      Alert.alert('Missing Information', 'Please add at least one instruction');
      return false;
    }

    return true;
  };

  const handleSubmit = () => {
    if (!validateForm()) return;

    const validIngredients = ingredients.filter(ing => ing.trim());
    const validInstructions = instructions.filter(inst => inst.trim());
    const tagList = tags.split(',').map(tag => tag.trim()).filter(Boolean);

    const parsedIngredients = validIngredients.map((ing, index) => {
      const parsed = ingredientParser.parse(ing);
      return {
        id: `ing-${index + 1}`,
        recipeText: ing,
        parsed,
        requiredQuantity: parsed.quantity || 1,
        requiredUnit: parsed.unit || 'piece'
      };
    });

    addRecipe({
      name: name.trim(),
      description: description.trim(),
      category,
      prepTime: Number(prepTime),
      cookTime: Number(cookTime),
      servings: Number(servings),
      difficulty,
      ingredients: parsedIngredients,
      instructions: validInstructions,
      tags: tagList.length > 0 ? tagList : [category],
      imageUrl: imageUrl.trim() || undefined
    });

    Alert.alert(
      'Success!',
      'Your recipe has been saved',
      [
        {
          text: 'OK',
          onPress: () => navigation.goBack()
        }
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backButtonText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.title}>New Recipe</Text>
          <TouchableOpacity onPress={handleSubmit} style={styles.saveButton}>
            <Text style={styles.saveButtonText}>Save</Text>
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardAvoid}
        >
          <ScrollView
            ref={scrollViewRef}
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Basic Info</Text>

              <TextInput
                style={styles.input}
                placeholder="Recipe Name"
                placeholderTextColor={theme.colors.textLight}
                value={name}
                onChangeText={setName}
              />

              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Description"
                placeholderTextColor={theme.colors.textLight}
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={3}
              />

              <TextInput
                style={styles.input}
                placeholder="Image URL (optional)"
                placeholderTextColor={theme.colors.textLight}
                value={imageUrl}
                onChangeText={setImageUrl}
                autoCapitalize="none"
              />
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Category & Difficulty</Text>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillContainer}>
                {categories.map(cat => (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.pill, category === cat && styles.pillActive]}
                    onPress={() => setCategory(cat)}
                  >
                    <Text style={[styles.pillText, category === cat && styles.pillTextActive]}>
                      {cat.charAt(0).toUpperCase() + cat.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <View style={styles.difficultyContainer}>
                {difficulties.map(diff => (
                  <TouchableOpacity
                    key={diff}
                    style={[styles.difficultyButton, difficulty === diff && styles.difficultyActive]}
                    onPress={() => setDifficulty(diff)}
                  >
                    <Text style={[styles.difficultyText, difficulty === diff && styles.difficultyTextActive]}>
                      {diff.charAt(0).toUpperCase() + diff.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Time & Servings</Text>

              <View style={styles.row}>
                <View style={styles.halfInput}>
                  <Text style={styles.inputLabel}>Prep (min)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="15"
                    placeholderTextColor={theme.colors.textLight}
                    value={prepTime}
                    onChangeText={setPrepTime}
                    keyboardType="numeric"
                  />
                </View>

                <View style={styles.halfInput}>
                  <Text style={styles.inputLabel}>Cook (min)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="30"
                    placeholderTextColor={theme.colors.textLight}
                    value={cookTime}
                    onChangeText={setCookTime}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              <View style={styles.halfInput}>
                <Text style={styles.inputLabel}>Servings</Text>
                <TextInput
                  style={styles.input}
                  placeholder="4"
                  placeholderTextColor={theme.colors.textLight}
                  value={servings}
                  onChangeText={setServings}
                  keyboardType="numeric"
                />
              </View>
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Ingredients</Text>
                <TouchableOpacity onPress={addIngredientField} style={styles.addButton}>
                  <Text style={styles.addButtonText}>+ Add</Text>
                </TouchableOpacity>
              </View>

              {ingredients.map((ingredient, index) => (
                <View key={index} style={styles.listItem}>
                  <TextInput
                    style={[styles.input, styles.listInput]}
                    placeholder="e.g., 2 cups flour"
                    placeholderTextColor={theme.colors.textLight}
                    value={ingredient}
                    onChangeText={(text) => updateIngredient(index, text)}
                  />
                  {ingredients.length > 1 && (
                    <TouchableOpacity
                      onPress={() => removeIngredient(index)}
                      style={styles.removeButton}
                    >
                      <Text style={styles.removeButtonText}>✕</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Instructions</Text>
                <TouchableOpacity onPress={addInstructionField} style={styles.addButton}>
                  <Text style={styles.addButtonText}>+ Add</Text>
                </TouchableOpacity>
              </View>

              {instructions.map((instruction, index) => (
                <View key={index} style={styles.listItem}>
                  <Text style={styles.stepNumber}>{index + 1}.</Text>
                  <TextInput
                    style={[styles.input, styles.listInput, styles.instructionInput]}
                    placeholder="Enter step"
                    placeholderTextColor={theme.colors.textLight}
                    value={instruction}
                    onChangeText={(text) => updateInstruction(index, text)}
                    multiline
                  />
                  {instructions.length > 1 && (
                    <TouchableOpacity
                      onPress={() => removeInstruction(index)}
                      style={styles.removeButton}
                    >
                      <Text style={styles.removeButtonText}>✕</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </View>

            <View style={[styles.section, { marginBottom: 40 }]}>
              <Text style={styles.sectionTitle}>Tags</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Italian, Quick, Vegetarian (comma-separated)"
                placeholderTextColor={theme.colors.textLight}
                value={tags}
                onChangeText={setTags}
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Animated.View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  backButton: {
    padding: theme.spacing.sm,
  },
  backButtonText: {
    ...theme.typography.body,
    color: theme.colors.error,
  },
  title: {
    ...theme.typography.h2,
    color: theme.colors.text,
  },
  saveButton: {
    padding: theme.spacing.sm,
  },
  saveButtonText: {
    ...theme.typography.bodyBold,
    color: theme.colors.primary,
  },
  keyboardAvoid: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingVertical: theme.spacing.lg,
  },
  section: {
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  sectionTitle: {
    ...theme.typography.h3,
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  input: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    ...theme.typography.body,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  inputLabel: {
    ...theme.typography.caption,
    color: theme.colors.textLight,
    marginBottom: theme.spacing.xs,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  halfInput: {
    flex: 1,
    marginRight: theme.spacing.sm,
  },
  pillContainer: {
    marginBottom: theme.spacing.md,
  },
  pill: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.pill,
    backgroundColor: theme.colors.surface,
    marginRight: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  pillActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  pillText: {
    ...theme.typography.bodySmall,
    color: theme.colors.textLight,
  },
  pillTextActive: {
    color: theme.colors.background,
    fontWeight: '600',
  },
  difficultyContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  difficultyButton: {
    flex: 1,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface,
    marginRight: theme.spacing.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  difficultyActive: {
    backgroundColor: theme.colors.secondary,
    borderColor: theme.colors.secondary,
  },
  difficultyText: {
    ...theme.typography.bodySmall,
    color: theme.colors.textLight,
  },
  difficultyTextActive: {
    color: theme.colors.background,
    fontWeight: '600',
  },
  addButton: {
    padding: theme.spacing.sm,
  },
  addButtonText: {
    ...theme.typography.bodyBold,
    color: theme.colors.primary,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.sm,
  },
  listInput: {
    flex: 1,
    marginBottom: 0,
    marginRight: theme.spacing.sm,
  },
  instructionInput: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  stepNumber: {
    ...theme.typography.bodyBold,
    color: theme.colors.textLight,
    marginRight: theme.spacing.sm,
    marginTop: theme.spacing.md,
    minWidth: 20,
  },
  removeButton: {
    padding: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  removeButtonText: {
    fontSize: 20,
    color: theme.colors.error,
  },
});