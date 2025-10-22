import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export type ConfidenceLevel = 'high' | 'medium' | 'low';

interface ConfidenceChipProps {
  confidence: number; // 0.0 - 1.0
  provenance?: 'creator_provided' | 'detected' | 'user_edited' | 'substitution';
  showText?: boolean;
}

/**
 * ConfidenceChip Component
 *
 * Visual indicator for extraction confidence levels per PRD:
 * - ≥0.95: Green (creator-provided, high confidence)
 * - 0.80-0.94: Green (detected, acceptable confidence)
 * - 0.60-0.79: Amber (requires confirmation)
 * - <0.60: Red (must edit or discard)
 */
export const ConfidenceChip: React.FC<ConfidenceChipProps> = ({
  confidence,
  provenance,
  showText = true,
}) => {
  const getLevel = (): ConfidenceLevel => {
    if (confidence >= 0.80) return 'high';
    if (confidence >= 0.60) return 'medium';
    return 'low';
  };

  const getColor = (): string => {
    const level = getLevel();
    switch (level) {
      case 'high':
        return '#10B981'; // Green
      case 'medium':
        return '#F59E0B'; // Amber
      case 'low':
        return '#EF4444'; // Red
    }
  };

  const getLabel = (): string => {
    if (provenance === 'creator_provided') {
      return 'Creator-provided';
    }
    if (provenance === 'user_edited') {
      return 'You edited';
    }
    if (provenance === 'substitution') {
      return 'Substitution';
    }

    // Default to confidence percentage
    const level = getLevel();
    if (level === 'high') return `${Math.round(confidence * 100)}%`;
    if (level === 'medium') return `${Math.round(confidence * 100)}%`;
    return 'Low confidence';
  };

  return (
    <View style={[styles.chip, { backgroundColor: getColor() }]}>
      <View style={styles.dot} />
      {showText && <Text style={styles.label}>{getLabel()}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'white',
    marginRight: 4,
  },
  label: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
});
