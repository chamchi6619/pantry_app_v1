import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
} from 'react-native';
import { theme } from '../../../core/constants/theme';

interface ScrollableCategoriesProps {
  categories: string[];
  activeCategory: string;
  onCategoryPress: (category: string) => void;
  isPantryMode?: boolean;
}

export const ScrollableCategories: React.FC<ScrollableCategoriesProps> = ({
  categories,
  activeCategory,
  onCategoryPress,
  isPantryMode = false,
}) => {
  // Different categories for pantry mode
  const displayCategories = isPantryMode
    ? ['Use Soon', 'High Match', 'Quick Meals', 'One Pot', 'Leftovers', 'Batch Cook']
    : categories;

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {displayCategories.map((category) => (
          <Pressable
            key={category}
            style={styles.categoryItem}
            onPress={() => onCategoryPress(category)}
          >
            <Text
              style={[
                styles.categoryText,
                activeCategory === category && styles.categoryTextActive,
              ]}
            >
              {category}
            </Text>
            {activeCategory === category && (
              <View style={styles.underline} />
            )}
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.background,
    paddingVertical: 12,
  },
  scrollContent: {
    paddingHorizontal: 16,
    gap: 24,
  },
  categoryItem: {
    position: 'relative',
    paddingVertical: 4,
  },
  categoryText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    fontWeight: '400',
  },
  categoryTextActive: {
    color: theme.colors.text,
    fontWeight: '500',
  },
  underline: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 1.5,
    backgroundColor: theme.colors.text,
  },
});