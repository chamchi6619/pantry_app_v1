import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
} from 'react-native';
import { RecipeScore } from '../types';
import { InventoryItem } from '../../../stores/inventoryStore';

interface RecipeExplainModalProps {
  visible: boolean;
  onClose: () => void;
  recipeScore: RecipeScore | null;
  inventory: InventoryItem[];
}

export const RecipeExplainModal: React.FC<RecipeExplainModalProps> = ({
  visible,
  onClose,
  recipeScore,
  inventory,
}) => {
  if (!recipeScore) return null;

  const getDaysUntilExpiry = (date: string | undefined) => {
    if (!date) return null;
    const expiry = new Date(date);
    const today = new Date();
    const diffTime = expiry.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const getExpiryBadgeColor = (days: number | null) => {
    if (days === null) return '#6B7280';
    if (days <= 1) return '#DC2626';
    if (days <= 3) return '#F59E0B';
    if (days <= 7) return '#10B981';
    return '#6B7280';
  };

  const getExpiryText = (days: number | null) => {
    if (days === null) return 'No expiry';
    if (days < 0) return 'Expired!';
    if (days === 0) return 'Today!';
    if (days === 1) return 'Tomorrow';
    return `${days} days`;
  };

  const formatPercentage = (value: number) => {
    return `${Math.round(value)}%`;
  };

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
          <View style={styles.header}>
            <Text style={styles.title}>Why This Recipe?</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeIcon}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
            {/* Recipe Name */}
            <View style={styles.recipeHeader}>
              <Text style={styles.recipeName}>{recipeScore.recipe.name}</Text>
              <View style={styles.scoreContainer}>
                <Text style={styles.starIcon}>⭐</Text>
                <Text style={styles.totalScore}>
                  {Math.round(recipeScore.totalScore)}
                </Text>
              </View>
            </View>

            {/* Score Breakdown */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Score Breakdown</Text>

              <View style={styles.scoreRow}>
                <Text style={styles.scoreLabel}>Ingredient Match</Text>
                <View style={styles.scoreBar}>
                  <View
                    style={[
                      styles.scoreBarFill,
                      { width: `${recipeScore.matchPercentage}%` },
                    ]}
                  />
                </View>
                <Text style={styles.scoreValue}>
                  {formatPercentage(recipeScore.matchPercentage)}
                </Text>
              </View>

              <View style={styles.scoreRow}>
                <Text style={styles.scoreLabel}>Expiring Bonus</Text>
                <View style={styles.scoreBar}>
                  <View
                    style={[
                      styles.scoreBarFill,
                      styles.expiringBar,
                      { width: `${Math.min(100, recipeScore.expiringScore * 10)}%` },
                    ]}
                  />
                </View>
                <Text style={styles.scoreValue}>+{recipeScore.expiringScore}</Text>
              </View>

              <View style={styles.scoreRow}>
                <Text style={styles.scoreLabel}>Category Weight</Text>
                <Text style={styles.categoryChip}>{recipeScore.recipe.category}</Text>
                <Text style={styles.scoreValue}>
                  x{recipeScore.debugInfo.categoryWeights[recipeScore.recipe.category] || 1}
                </Text>
              </View>
            </View>

            {/* Expiring Ingredients */}
            {recipeScore.expiringIngredients.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>
                  Uses Expiring Items ({recipeScore.expiringIngredients.length})
                </Text>
                {recipeScore.expiringIngredients.map((item) => {
                  const days = getDaysUntilExpiry(item.expirationDate);
                  return (
                    <View key={item.id} style={styles.expiringItem}>
                      <Text style={[styles.timeIcon, { color: getExpiryBadgeColor(days) }]}>
                        ⏰
                      </Text>
                      <Text style={styles.expiringItemName}>{item.name}</Text>
                      <View
                        style={[
                          styles.expiryBadge,
                          { backgroundColor: getExpiryBadgeColor(days) },
                        ]}
                      >
                        <Text style={styles.expiryBadgeText}>
                          {getExpiryText(days)}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Missing Ingredients */}
            {recipeScore.missingIngredients.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>
                  Missing Ingredients ({recipeScore.missingIngredients.length})
                </Text>
                {recipeScore.missingIngredients.map((ingredient, index) => (
                  <View key={index} style={styles.missingItem}>
                    <Text style={styles.cartOutlineIcon}>🛒</Text>
                    <Text style={styles.missingItemText}>{ingredient}</Text>
                  </View>
                ))}
                <TouchableOpacity style={styles.addToShoppingButton}>
                  <Text style={styles.addIcon}>➕</Text>
                  <Text style={styles.addToShoppingText}>Add to Shopping List</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Match Details */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Match Details</Text>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Total Ingredients:</Text>
                <Text style={styles.detailValue}>
                  {recipeScore.debugInfo.totalRequired}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Matched:</Text>
                <Text style={[styles.detailValue, styles.successText]}>
                  {recipeScore.debugInfo.matchedCount}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Missing:</Text>
                <Text style={[styles.detailValue, styles.warningText]}>
                  {recipeScore.missingIngredients.length}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Inventory Hash:</Text>
                <Text style={[styles.detailValue, styles.hashText]}>
                  {recipeScore.debugInfo.inventoryHash}
                </Text>
              </View>
            </View>

            {/* Algorithm Explanation */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>How It Works</Text>
              <Text style={styles.explanationText}>
                This recipe was scored based on:
              </Text>
              <View style={styles.bulletPoint}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.bulletText}>
                  Matching {recipeScore.debugInfo.matchedCount} of{' '}
                  {recipeScore.debugInfo.totalRequired} ingredients in your inventory
                </Text>
              </View>
              <View style={styles.bulletPoint}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.bulletText}>
                  Prioritizing {recipeScore.expiringIngredients.length} expiring items
                  to reduce food waste
                </Text>
              </View>
              <View style={styles.bulletPoint}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.bulletText}>
                  Applying a {recipeScore.recipe.category} category weight of{' '}
                  {recipeScore.debugInfo.categoryWeights[recipeScore.recipe.category] || 1}x
                </Text>
              </View>
              <View style={styles.bulletPoint}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.bulletText}>
                  Using smart ingredient matching with 85%+ confidence threshold
                </Text>
              </View>
            </View>
          </ScrollView>
        </View>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    paddingBottom: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  closeButton: {
    padding: 4,
  },
  scrollView: {
    padding: 20,
  },
  recipeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  recipeName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
    flex: 1,
  },
  scoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  totalScore: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#92400E',
    marginLeft: 4,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  scoreLabel: {
    flex: 1,
    fontSize: 14,
    color: '#6B7280',
  },
  scoreBar: {
    flex: 2,
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    marginHorizontal: 12,
    overflow: 'hidden',
  },
  scoreBarFill: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 4,
  },
  expiringBar: {
    backgroundColor: '#F59E0B',
  },
  scoreValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    minWidth: 45,
    textAlign: 'right',
  },
  categoryChip: {
    backgroundColor: '#E0E7FF',
    color: '#4338CA',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    fontSize: 12,
    fontWeight: '500',
    marginHorizontal: 12,
  },
  expiringItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    marginBottom: 8,
  },
  expiringItemName: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    color: '#374151',
  },
  expiryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  expiryBadgeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  missingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    marginBottom: 8,
  },
  missingItemText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#6B7280',
  },
  addToShoppingButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#ECFDF5',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#10B981',
  },
  addToShoppingText: {
    marginLeft: 6,
    fontSize: 14,
    fontWeight: '500',
    color: '#10B981',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  detailLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  successText: {
    color: '#10B981',
  },
  warningText: {
    color: '#F59E0B',
  },
  hashText: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: '#9CA3AF',
  },
  explanationText: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 12,
  },
  bulletPoint: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  bullet: {
    fontSize: 14,
    color: '#10B981',
    marginRight: 8,
  },
  bulletText: {
    flex: 1,
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },
  closeIcon: {
    fontSize: 24,
    color: '#4B5563',
  },
  starIcon: {
    fontSize: 20,
    color: '#F59E0B',
  },
  timeIcon: {
    fontSize: 16,
  },
  cartOutlineIcon: {
    fontSize: 16,
    color: '#6B7280',
  },
  addIcon: {
    fontSize: 20,
    color: '#10B981',
  },
});