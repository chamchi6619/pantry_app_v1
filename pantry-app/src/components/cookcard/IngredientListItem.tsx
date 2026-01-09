import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ingredient } from '../../types/CookCard';
import { ConfidenceChip } from './ConfidenceChip';
import { useUserPreferences } from '../../hooks/useUserPreferences';
import { UnitConverter } from '../../features/recipes/utils/unitConverter';

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
  const { preferences } = useUserPreferences();
  const measurementSystem = preferences?.measurement_system || 'imperial';
  const converter = new UnitConverter();

  const formatQuantity = (): string => {
    if (!ingredient.amount) return '';

    let amount = ingredient.amount;
    let unit = ingredient.unit || '';

    // Only convert if user prefers metric and we have a unit to convert
    if (measurementSystem === 'metric' && unit) {
      // Determine target unit based on original unit type
      let targetUnit = '';

      if (converter.isVolumeUnit(unit)) {
        // Convert cups/tbsp/tsp to ml or L
        if (unit.toLowerCase().includes('cup') || unit.toLowerCase().includes('tbsp') || unit.toLowerCase().includes('tsp')) {
          targetUnit = 'ml';
        }
      } else if (converter.isWeightUnit(unit)) {
        // Convert lb/oz to g or kg
        if (unit.toLowerCase().includes('lb') || unit.toLowerCase().includes('oz')) {
          targetUnit = 'g';
        }
      }

      // Attempt conversion if we found a target unit
      if (targetUnit) {
        try {
          const result = converter.convert(amount, unit, targetUnit);
          if (result.success && result.convertedQuantity !== undefined) {
            amount = Math.round(result.convertedQuantity * 10) / 10; // Round to 1 decimal
            unit = targetUnit;

            // Convert large g amounts to kg
            if (unit === 'g' && amount >= 1000) {
              amount = Math.round((amount / 1000) * 10) / 10;
              unit = 'kg';
            }
            // Convert large ml amounts to L
            if (unit === 'ml' && amount >= 1000) {
              amount = Math.round((amount / 1000) * 10) / 10;
              unit = 'L';
            }
          }
        } catch (error) {
          // Conversion failed, keep original
          console.log(`[IngredientListItem] Conversion failed for ${amount} ${unit}`);
        }
      }
    }

    let qty = amount.toString();
    if (unit) {
      qty += ` ${unit}`;
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
