import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../../../core/constants/theme';

interface HeaderProps {
  title?: string;
  showBack?: boolean;
  onBackPress?: () => void;
  rightAction?: React.ReactNode;
}

export const Header: React.FC<HeaderProps> = ({
  title = 'Pantry Pal',
  showBack = false,
  onBackPress,
  rightAction,
}) => {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.content}>
        <View style={styles.left}>
          {showBack && onBackPress && (
            <Pressable onPress={onBackPress} style={styles.backButton}>
              <Text style={styles.backText}>←</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.center}>
          <Text style={styles.title}>{title}</Text>
        </View>

        <View style={styles.right}>
          {rightAction}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.background,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  content: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  left: {
    flex: 1,
    alignItems: 'flex-start',
  },
  center: {
    flex: 2,
    alignItems: 'center',
  },
  right: {
    flex: 1,
    alignItems: 'flex-end',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.primary,
    letterSpacing: 0.5,
  },
  backButton: {
    padding: 8,
  },
  backText: {
    fontSize: 24,
    color: theme.colors.text,
  },
});