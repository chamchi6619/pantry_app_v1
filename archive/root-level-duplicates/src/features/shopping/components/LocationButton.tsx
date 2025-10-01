import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { theme } from '../../../core/constants/theme';

interface LocationButtonProps {
  icon: string;
  isSelected: boolean;
  onPress: () => void;
}

export const LocationButton: React.FC<LocationButtonProps> = ({
  icon,
  isSelected,
  onPress,
}) => {
  return (
    <Pressable
      style={[
        styles.locationButton,
        isSelected && styles.locationButtonSelected,
      ]}
      onPress={onPress}
    >
      <Text
        style={[
          styles.locationIcon,
          isSelected && styles.locationIconSelected,
        ]}
      >
        {icon}
      </Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  locationButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F0F0F0',
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 6,
  },
  locationButtonSelected: {
    backgroundColor: theme.colors.primary,
  },
  locationIcon: {
    fontSize: 22,
    opacity: 0.6,
  },
  locationIconSelected: {
    opacity: 1,
  },
});