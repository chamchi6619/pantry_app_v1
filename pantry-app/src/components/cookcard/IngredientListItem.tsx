import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ingredient } from '../../types/CookCard';
import { ConfidenceChip } from './ConfidenceChip';

interface IngredientListItemProps {
  ingredient: Ingredient;
  onPress?: () => void;
  showConfidence?: boolean;
}

/**
 * IngredientListItem Component
 *
 * Displays a single ingredient with:
 * - Have/Need status (green/red background)
 * - Confidence chip
 * - Quantity and preparation
 * - Substitution badge (if applicable)
 */
export const IngredientListItem: React.FC<IngredientListItemProps> = ({
  ingredient,
  onPress,
  showConfidence = true,
}) => {
  const formatQuantity = (): string => {
    if (!ingredient.amount) return '';

    let qty = ingredient.amount.toString();
    if (ingredient.unit) {
      qty += ` ${ingredient.unit}`;
    }
    return qty;
  };

  const formatIngredientText = (): string => {
    let text = ingredient.name;
    if (ingredient.preparation) {
      text += `, ${ingredient.preparation}`;
    }
    return text;
  };

  const getStatusColor = (): string => {
    if (ingredient.in_pantry) {
      return '#D1FAE5'; // Light green
    }
    return '#FEE2E2'; // Light red
  };

  const getStatusIcon = (): string => {
    return ingredient.in_pantry ? '✓' : '✗';
  };

  return (
    <TouchableOpacity
      style={[styles.container, { backgroundColor: getStatusColor() }]}
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={styles.content}>
        {/* Status Icon */}
        <View style={styles.statusIcon}>
          <Text style={styles.statusIconText}>{getStatusIcon()}</Text>
        </View>

        {/* Ingredient Details */}
        <View style={styles.details}>
          <View style={styles.row}>
            <Text style={styles.quantity}>{formatQuantity()}</Text>
            <Text style={styles.name}>{formatIngredientText()}</Text>
          </View>

          {/* Substitution Badge */}
          {ingredient.is_substitution && (
            <View style={styles.substitutionBadge}>
              <Text style={styles.substitutionText}>
                ↔ {ingredient.substitution_for}
              </Text>
            </View>
          )}

          {/* Optional Indicator */}
          {ingredient.is_optional && (
            <Text style={styles.optionalText}>(optional)</Text>
          )}
        </View>

        {/* Confidence Chip */}
        {showConfidence && (
          <ConfidenceChip
            confidence={ingredient.confidence}
            provenance={ingredient.provenance}
            showText={false}
          />
        )}
      </View>

      {/* Substitution Rationale (if present) */}
      {ingredient.is_substitution && ingredient.substitution_rationale && (
        <View style={styles.rationaleContainer}>
          <Text style={styles.rationaleText}>
            {ingredient.substitution_rationale}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 8,
    marginBottom: 8,
    padding: 12,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  statusIconText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  details: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  quantity: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginRight: 8,
  },
  name: {
    fontSize: 14,
    color: '#374151',
    flex: 1,
  },
  substitutionBadge: {
    marginTop: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: '#FEF3C7',
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  substitutionText: {
    fontSize: 12,
    color: '#92400E',
    fontWeight: '500',
  },
  optionalText: {
    fontSize: 12,
    color: '#6B7280',
    fontStyle: 'italic',
    marginTop: 2,
  },
  rationaleContainer: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  rationaleText: {
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 16,
  },
});
