import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  Pressable,
  ScrollView,
} from 'react-native';
import { theme } from '../../../core/constants/theme';
import { Button } from '../../../core/components/ui/Button';

interface RecentCaptureProps {
  id: string;
  imageUri?: string;
}

const RecentCapture: React.FC<RecentCaptureProps> = ({ id }) => {
  return (
    <View style={styles.recentCapture}>
      <Text style={styles.captureIcon}>🖼️</Text>
    </View>
  );
};

export const ReceiptCaptureScreen: React.FC<{ navigation?: any }> = ({ navigation }) => {
  const [isCapturing, setIsCapturing] = useState(false);

  const handleCapture = () => {
    setIsCapturing(true);
    // Simulate capture
    setTimeout(() => {
      setIsCapturing(false);
      // Navigate to Fix Queue
      if (navigation) {
        navigation.navigate('FixQueue');
      }
    }, 2000);
  };

  const handleRetake = () => {
    setIsCapturing(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backButton}>
          <Text style={styles.backIcon}>←</Text>
        </Pressable>
        <Text style={styles.title}>Receipt Capture</Text>
        <Pressable style={styles.retakeButton} onPress={handleRetake}>
          <Text style={styles.retakeIcon}>↻</Text>
        </Pressable>
      </View>

      {/* Camera View */}
      <View style={styles.cameraSection}>
        <View style={styles.cameraContainer}>
          <View style={styles.cameraFrame}>
            {/* Corner markers */}
            <View style={[styles.cornerMarker, styles.topLeft]} />
            <View style={[styles.cornerMarker, styles.topRight]} />
            <View style={[styles.cornerMarker, styles.bottomLeft]} />
            <View style={[styles.cornerMarker, styles.bottomRight]} />

            {/* Camera placeholder */}
            <View style={styles.cameraPlaceholder}>
              <Text style={styles.cameraIcon}>📷</Text>
              <Text style={styles.positionText}>Position receipt within frame</Text>
            </View>
          </View>
        </View>

        {/* Capture Button */}
        <Pressable
          style={[styles.captureButton, isCapturing && styles.capturingButton]}
          onPress={handleCapture}
          disabled={isCapturing}
        >
          <View style={styles.captureInner}>
            {isCapturing && <Text style={styles.capturingText}>Processing...</Text>}
          </View>
        </Pressable>
      </View>

      {/* Tips Section */}
      <View style={styles.tipsSection}>
        <Text style={styles.tipsTitle}>Tips for better scanning:</Text>
        <View style={styles.tipsList}>
          <Text style={styles.tip}>• Ensure good lighting</Text>
          <Text style={styles.tip}>• Keep receipt flat and straight</Text>
          <Text style={styles.tip}>• Include entire receipt in frame</Text>
          <Text style={styles.tip}>• Avoid shadows and glare</Text>
        </View>
      </View>

      {/* Recent Captures */}
      <View style={styles.recentSection}>
        <Text style={styles.recentTitle}>Recent Captures</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.recentScroll}
        >
          <RecentCapture id="1" />
          <RecentCapture id="2" />
          <Pressable style={styles.addCapture}>
            <Text style={styles.addIcon}>+</Text>
          </Pressable>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.text,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  backButton: {
    padding: theme.spacing.sm,
  },
  backIcon: {
    fontSize: 24,
    color: theme.colors.textInverse,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.textInverse,
  },
  retakeButton: {
    padding: theme.spacing.sm,
  },
  retakeIcon: {
    fontSize: 24,
    color: theme.colors.textInverse,
  },
  cameraSection: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  cameraContainer: {
    width: '100%',
    aspectRatio: 0.75,
    maxWidth: 350,
  },
  cameraFrame: {
    flex: 1,
    borderWidth: 2,
    borderColor: theme.colors.textInverse,
    borderStyle: 'dashed',
    borderRadius: theme.borderRadius.lg,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cornerMarker: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderColor: theme.colors.primary,
    borderWidth: 3,
  },
  topLeft: {
    top: -1,
    left: -1,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: theme.borderRadius.lg,
  },
  topRight: {
    top: -1,
    right: -1,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    borderTopRightRadius: theme.borderRadius.lg,
  },
  bottomLeft: {
    bottom: -1,
    left: -1,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomLeftRadius: theme.borderRadius.lg,
  },
  bottomRight: {
    bottom: -1,
    right: -1,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderBottomRightRadius: theme.borderRadius.lg,
  },
  cameraPlaceholder: {
    alignItems: 'center',
  },
  cameraIcon: {
    fontSize: 64,
    marginBottom: theme.spacing.md,
  },
  positionText: {
    fontSize: 14,
    color: theme.colors.textInverse,
    opacity: 0.8,
  },
  captureButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: theme.colors.textInverse,
    padding: 4,
    marginTop: theme.spacing.xl,
  },
  capturingButton: {
    opacity: 0.7,
  },
  captureInner: {
    flex: 1,
    borderRadius: 31,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  capturingText: {
    color: theme.colors.textInverse,
    fontSize: 12,
    fontWeight: '600',
  },
  tipsSection: {
    backgroundColor: theme.colors.background,
    padding: theme.spacing.lg,
    borderTopLeftRadius: theme.borderRadius.xl,
    borderTopRightRadius: theme.borderRadius.xl,
  },
  tipsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  tipsList: {
    gap: theme.spacing.xs,
  },
  tip: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    lineHeight: 20,
  },
  recentSection: {
    backgroundColor: theme.colors.background,
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.lg,
  },
  recentTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  recentScroll: {
    flexDirection: 'row',
  },
  recentCapture: {
    width: 100,
    height: 120,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface,
    marginRight: theme.spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  captureIcon: {
    fontSize: 32,
  },
  addCapture: {
    width: 100,
    height: 120,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: theme.colors.border,
    borderStyle: 'dashed',
  },
  addIcon: {
    fontSize: 32,
    color: theme.colors.textSecondary,
  },
});