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

interface SegmentedControlProps {
  segments: string[];
  activeSegment: string;
  onSegmentPress: (segment: string) => void;
}

export const SegmentedControl: React.FC<SegmentedControlProps> = ({
  segments,
  activeSegment,
  onSegmentPress,
}) => {
  const segmentWidth = screenWidth / segments.length;

  return (
    <View style={styles.container}>
      <View style={styles.segmentContainer}>
        {segments.map((segment, index) => {
          const isActive = activeSegment === segment;
          return (
            <Pressable
              key={segment}
              style={[styles.segment, { width: segmentWidth }]}
              onPress={() => onSegmentPress(segment)}
            >
              <Text
                style={[
                  styles.segmentText,
                  isActive && styles.segmentTextActive,
                ]}
              >
                {segment}
              </Text>
              {isActive && <View style={styles.underline} />}
            </Pressable>
          );
        })}
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
  segmentContainer: {
    flexDirection: 'row',
  },
  segment: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  segmentText: {
    fontSize: 15,
    fontWeight: '500',
    color: theme.colors.textSecondary,
    letterSpacing: 0.1,
  },
  segmentTextActive: {
    fontWeight: '600',
    color: theme.colors.text,
  },
  underline: {
    position: 'absolute',
    bottom: 0,
    left: '10%',
    right: '10%',
    height: 3,
    backgroundColor: theme.colors.primary,
    borderRadius: 2,
  },
});