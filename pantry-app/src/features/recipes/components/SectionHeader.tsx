import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { theme } from '../../../core/constants/theme';

interface SectionHeaderProps {
  title: string;
  showSeeAll?: boolean;
  onSeeAllPress?: () => void;
  showUnderline?: boolean;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  showSeeAll = false,
  onSeeAllPress,
  showUnderline = true,
}) => {
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>{title}</Text>
        {showSeeAll && onSeeAllPress && (
          <Pressable onPress={onSeeAllPress} style={styles.seeAllButton}>
            <Text style={styles.seeAllText}>See all</Text>
          </Pressable>
        )}
      </View>
      {showUnderline && <View style={styles.underline} />}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  content: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: theme.colors.text,
  },
  seeAllButton: {
    padding: 4,
  },
  seeAllText: {
    fontSize: 14,
    color: theme.colors.primary,
    fontWeight: '500',
  },
  underline: {
    height: 2,
    width: 40,
    backgroundColor: theme.colors.primary,
    borderRadius: 1,
  },
});