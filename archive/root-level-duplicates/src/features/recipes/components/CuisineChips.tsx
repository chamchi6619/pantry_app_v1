import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
} from 'react-native';
import { theme } from '../../../core/constants/theme';

interface CuisineChipsProps {
  cuisines: string[];
  selectedCuisine: string | null;
  onCuisinePress: (cuisine: string | null) => void;
}

export const CuisineChips: React.FC<CuisineChipsProps> = ({
  cuisines,
  selectedCuisine,
  onCuisinePress,
}) => {
  const allCuisines = ['All', ...cuisines];

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {allCuisines.map((cuisine) => {
          const isActive = cuisine === 'All'
            ? selectedCuisine === null
            : selectedCuisine === cuisine;

          return (
            <Pressable
              key={cuisine}
              style={[styles.chip, isActive && styles.chipActive]}
              onPress={() => onCuisinePress(cuisine === 'All' ? null : cuisine)}
            >
              <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                {cuisine}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 12,
  },
  scrollContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
    marginRight: 8,
  },
  chipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  chipText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    fontWeight: '400',
  },
  chipTextActive: {
    color: theme.colors.textInverse,
    fontWeight: '500',
  },
});