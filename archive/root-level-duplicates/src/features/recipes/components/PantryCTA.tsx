import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
} from 'react-native';
import { theme } from '../../../core/constants/theme';

const { width: screenWidth } = Dimensions.get('window');

interface PantryCTAProps {
  onPress: () => void;
}

export const PantryCTA: React.FC<PantryCTAProps> = ({ onPress }) => {
  return (
    <View style={styles.container}>
      <Pressable style={styles.card} onPress={onPress}>
        <View style={styles.iconContainer}>
          <Text style={styles.icon}>📸</Text>
        </View>
        <View style={styles.content}>
          <Text style={styles.title}>Scan your receipts</Text>
          <Text style={styles.subtitle}>
            Quickly add ingredients to your pantry
          </Text>
        </View>
        <Text style={styles.arrow}>→</Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    marginVertical: 16,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadows.sm,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  icon: {
    fontSize: 24,
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  arrow: {
    fontSize: 20,
    color: theme.colors.textSecondary,
    marginLeft: 8,
  },
});