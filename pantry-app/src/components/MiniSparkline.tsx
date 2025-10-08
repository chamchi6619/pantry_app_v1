import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';

interface MiniSparklineProps {
  data: number[];
  width?: number;
  height?: number;
  strokeWidth?: number;
  strokeColor?: string;
}

export const MiniSparkline: React.FC<MiniSparklineProps> = ({
  data,
  width = 100,
  height = 40,
  strokeWidth = 2,
  strokeColor = '#fff',
}) => {
  if (!data || data.length === 0) {
    return null;
  }

  // Normalize data to fit within the height
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1; // Avoid division by zero

  // Create points for the polyline
  const points = data
    .map((value, index) => {
      const x = (index / (data.length - 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <View style={[styles.container, { width, height }]}>
      <Svg width={width} height={height}>
        <Polyline
          points={points}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
});
