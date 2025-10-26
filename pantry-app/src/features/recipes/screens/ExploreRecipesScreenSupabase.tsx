/**
 * Recipe Screen Version Switcher
 *
 * This wrapper allows switching between 5 different UI implementations:
 * v1 - Hero Visual Feed (large images, personalized greeting, modern cards)
 * v2 - Bento Grid Modern (asymmetric layout, 2025 trend, warm colors)
 * v3 - Minimalist Elegant (cookbook-style, serif typography, clean)
 * v4 - Smart Sections (organized categories, horizontal scrolling) ⭐ RECOMMENDED
 * v5 - Full-Screen Immersive (TikTok-style vertical feed, swipeable)
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../../core/constants/theme';

// Import all versions
import { ExploreRecipesScreenV1 } from './ExploreRecipesScreen.v1';
import { ExploreRecipesScreenV2 } from './ExploreRecipesScreen.v2';
import { ExploreRecipesScreenV3 } from './ExploreRecipesScreen.v3';
import { ExploreRecipesScreenV4 } from './ExploreRecipesScreen.v4';
import { ExploreRecipesScreenV5 } from './ExploreRecipesScreen.v5';

const variantInfo = [
  { id: 1, name: 'Hero Feed', icon: '🌟', description: 'Modern cards' },
  { id: 2, name: 'Bento Grid', icon: '🎨', description: '2025 trend' },
  { id: 3, name: 'Elegant', icon: '📖', description: 'Cookbook style' },
  { id: 4, name: 'Smart Sections', icon: '🏷️', description: 'Organized' },
  { id: 5, name: 'Immersive', icon: '📱', description: 'Full-screen' },
];

export const ExploreRecipesScreenSupabase: React.FC = () => {
  const navigation = useNavigation();
  const [selectedVersion, setSelectedVersion] = useState<1 | 2 | 3 | 4 | 5>(4); // Default to v4 (recommended)

  const renderVersion = () => {
    switch (selectedVersion) {
      case 1:
        return <ExploreRecipesScreenV1 />;
      case 2:
        return <ExploreRecipesScreenV2 />;
      case 3:
        return <ExploreRecipesScreenV3 />;
      case 4:
        return <ExploreRecipesScreenV4 />;
      case 5:
        return <ExploreRecipesScreenV5 />;
      default:
        return <ExploreRecipesScreenV4 />;
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Version Tabs */}
      <View style={styles.tabBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabScrollContent}
        >
          {variantInfo.map((variant) => (
            <Pressable
              key={variant.id}
              style={[
                styles.tab,
                selectedVersion === variant.id && styles.tabActive,
              ]}
              onPress={() => setSelectedVersion(variant.id as 1 | 2 | 3 | 4 | 5)}
            >
              <Text style={styles.tabIcon}>{variant.icon}</Text>
              <Text
                style={[
                  styles.tabText,
                  selectedVersion === variant.id && styles.tabTextActive,
                ]}
              >
                {variant.name}
              </Text>
              <Text
                style={[
                  styles.tabDescription,
                  selectedVersion === variant.id && styles.tabDescriptionActive,
                ]}
              >
                {variant.description}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Meal Planning Button */}
        <Pressable
          style={styles.calendarButton}
          onPress={() => {
            console.log('[Navigation] 📍 Calendar button pressed - navigating to MealPlanning');
            try {
              navigation.navigate('MealPlanning' as never);
              console.log('[Navigation] ✅ Navigation call completed');
            } catch (error) {
              console.error('[Navigation] ❌ Navigation error:', error);
            }
          }}
        >
          <Ionicons name="calendar" size={24} color={theme.colors.primary} />
        </Pressable>
      </View>

      {/* Render Selected Version */}
      <View style={styles.content}>{renderVersion()}</View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  tabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 2,
    borderBottomColor: theme.colors.border,
  },
  calendarButton: {
    padding: theme.spacing.md,
    marginRight: theme.spacing.sm,
  },
  tabScrollContent: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  tab: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: theme.colors.border,
    minWidth: 100,
  },
  tabActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  tabIcon: {
    fontSize: 20,
    marginBottom: 2,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 2,
  },
  tabTextActive: {
    color: '#FFFFFF',
  },
  tabDescription: {
    fontSize: 10,
    color: theme.colors.textLight,
  },
  tabDescriptionActive: {
    color: '#FFFFFF',
    opacity: 0.9,
  },
  content: {
    flex: 1,
  },
});
