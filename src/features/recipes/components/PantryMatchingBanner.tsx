import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { theme } from '../../../core/constants/theme';

interface PantryMatchingBannerProps {
  isMatching: boolean;
  progress: { total: number; done: number };
}

export const PantryMatchingBanner: React.FC<PantryMatchingBannerProps> = ({
  isMatching,
  progress,
}) => {
  const animatedValue = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (isMatching) {
      Animated.timing(animatedValue, {
        toValue: progress.total > 0 ? progress.done / progress.total : 0,
        duration: 300,
        useNativeDriver: false,
      }).start();
    } else {
      animatedValue.setValue(0);
    }
  }, [progress.done, progress.total, isMatching, animatedValue]);

  if (!isMatching) return null;

  const progressPercentage = progress.total > 0
    ? Math.round((progress.done / progress.total) * 100)
    : 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <ActivityIndicator size="small" color={theme.colors.primary} />
        <Text style={styles.title}>Finding your perfect matches...</Text>
      </View>

      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <Animated.View
            style={[
              styles.progressFill,
              {
                width: animatedValue.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0%', '100%'],
                }),
              },
            ]}
          />
        </View>
        <Text style={styles.progressText}>
          {progress.done} of {progress.total} recipes ({progressPercentage}%)
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.surface,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.text,
    marginLeft: 8,
  },
  progressContainer: {
    gap: 8,
  },
  progressBar: {
    height: 4,
    backgroundColor: theme.colors.borderLight,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: theme.colors.primary,
    borderRadius: 2,
  },
  progressText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
});