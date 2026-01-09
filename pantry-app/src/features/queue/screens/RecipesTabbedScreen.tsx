/**
 * RecipesTabbedScreen
 *
 * Purpose: Design variant selector for testing 4 different UX approaches
 * Variants:
 *  1. Social/Trending - Personal greeting, trending content, social engagement
 *  2. Featured/Guided - Curated content, guidance badges, app branding
 *  3. Social Proof - Ratings first, reviews, difficulty badges
 *  4. Commerce/Offers - Promotional, special offers, commerce-driven
 * Pattern: A/B/C/D test multiple UX patterns, measure engagement
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, SafeAreaView, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../../core/constants/theme';
import Variant1_SocialTrendingScreen from './Variant1_SocialTrendingScreen';
import Variant2_FeaturedGuidedScreen from './Variant2_FeaturedGuidedScreen';
import Variant3_SocialProofScreen from './Variant3_SocialProofScreen';
import Variant4_CommerceOffersScreen from './Variant4_CommerceOffersScreen';

type VariantKey = 'v1' | 'v2' | 'v3' | 'v4';

const VARIANTS = [
  { key: 'v1' as const, label: 'Social', icon: 'people' as const, color: '#2F8D46' },
  { key: 'v2' as const, label: 'Featured', icon: 'star' as const, color: '#FF6B35' },
  { key: 'v3' as const, label: 'Ratings', icon: 'thumbs-up' as const, color: '#3B82F6' },
  { key: 'v4' as const, label: 'Offers', icon: 'pricetag' as const, color: '#8B6F47' },
];

export default function RecipesTabbedScreen() {
  const [activeVariant, setActiveVariant] = useState<VariantKey>('v1');
  const [showVariantPicker, setShowVariantPicker] = useState(false);

  const renderVariant = () => {
    switch (activeVariant) {
      case 'v1':
        return <Variant1_SocialTrendingScreen />;
      case 'v2':
        return <Variant2_FeaturedGuidedScreen />;
      case 'v3':
        return <Variant3_SocialProofScreen />;
      case 'v4':
        return <Variant4_CommerceOffersScreen />;
      default:
        return <Variant1_SocialTrendingScreen />;
    }
  };

  const activeVariantData = VARIANTS.find(v => v.key === activeVariant)!;

  return (
    <SafeAreaView style={styles.container}>
      {/* Variant Selector Bar */}
      <View style={styles.selectorBar}>
        <Pressable
          style={styles.variantButton}
          onPress={() => setShowVariantPicker(!showVariantPicker)}
        >
          <Ionicons name={activeVariantData.icon} size={20} color={activeVariantData.color} />
          <Text style={[styles.variantButtonText, { color: activeVariantData.color }]}>
            {activeVariantData.label}
          </Text>
          <Ionicons
            name={showVariantPicker ? 'chevron-up' : 'chevron-down'}
            size={20}
            color={activeVariantData.color}
          />
        </Pressable>
      </View>

      {/* Variant Picker Dropdown */}
      {showVariantPicker && (
        <View style={styles.variantPicker}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {VARIANTS.map(variant => (
              <Pressable
                key={variant.key}
                style={[
                  styles.variantCard,
                  activeVariant === variant.key && styles.variantCardActive,
                ]}
                onPress={() => {
                  setActiveVariant(variant.key);
                  setShowVariantPicker(false);
                }}
              >
                <Ionicons
                  name={variant.icon}
                  size={24}
                  color={activeVariant === variant.key ? variant.color : theme.colors.textSecondary}
                />
                <Text
                  style={[
                    styles.variantCardText,
                    activeVariant === variant.key && { color: variant.color },
                  ]}
                >
                  {variant.label}
                </Text>
                {activeVariant === variant.key && (
                  <Ionicons name="checkmark-circle" size={20} color={variant.color} />
                )}
              </Pressable>
            ))}
          </ScrollView>

          {/* Descriptions */}
          <View style={styles.variantDescription}>
            <Text style={styles.variantDescriptionTitle}>Design Variants:</Text>
            <Text style={styles.variantDescriptionText}>
              • <Text style={{ fontWeight: '600' }}>Social:</Text> Trending, personal, engagement metrics{'\n'}
              • <Text style={{ fontWeight: '600' }}>Featured:</Text> Curated content, guidance badges{'\n'}
              • <Text style={{ fontWeight: '600' }}>Ratings:</Text> Reviews, social proof, difficulty{'\n'}
              • <Text style={{ fontWeight: '600' }}>Offers:</Text> Promotions, commerce-driven
            </Text>
          </View>
        </View>
      )}

      {/* Content */}
      <View style={styles.content}>
        {renderVariant()}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  selectorBar: {
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  variantButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.xs,
  },
  variantButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  variantPicker: {
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  variantCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    marginRight: theme.spacing.sm,
    borderRadius: 12,
    backgroundColor: '#F5F5F5',
    minWidth: 120,
  },
  variantCardActive: {
    backgroundColor: '#E7F4EB',
  },
  variantCardText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    flex: 1,
  },
  variantDescription: {
    marginTop: theme.spacing.md,
    padding: theme.spacing.sm,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
  },
  variantDescriptionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  variantDescriptionText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    lineHeight: 18,
  },
  content: {
    flex: 1,
  },
});
