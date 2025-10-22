/**
 * Browse Platforms Screen
 *
 * Lets users choose which platform to browse for recipes
 * Opens native apps via deep-links, then user shares back
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import {
  openPlatformApp,
  getPlatformDisplayName,
  getPlatformIcon,
  showShareInstructions,
  type SupportedPlatform,
} from '../services/deepLinkService';

const PLATFORMS: SupportedPlatform[] = ['tiktok', 'instagram', 'xiaohongshu', 'youtube'];

export default function BrowsePlatformsScreen() {
  const [openingPlatform, setOpeningPlatform] = useState<SupportedPlatform | null>(null);

  const handlePlatformPress = async (platform: SupportedPlatform) => {
    setOpeningPlatform(platform);

    try {
      const result = await openPlatformApp(platform, 'recipe');

      if (result.success) {
        // Show instructions on how to share back
        setTimeout(() => {
          showShareInstructions(platform);
        }, 500);
      } else {
        Alert.alert(
          'Could not open app',
          `Unable to open ${getPlatformDisplayName(platform)}. Please install the app and try again.`,
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('Error opening platform:', error);
      Alert.alert(
        'Error',
        'Something went wrong. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setOpeningPlatform(null);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>Browse Recipes</Text>
          <Text style={styles.subtitle}>
            Choose a platform to browse recipes, then share them back to extract ingredients
          </Text>
        </View>

        <View style={styles.platformGrid}>
          {PLATFORMS.map((platform) => (
            <PlatformCard
              key={platform}
              platform={platform}
              isOpening={openingPlatform === platform}
              onPress={() => handlePlatformPress(platform)}
            />
          ))}
        </View>

        <View style={styles.instructions}>
          <Text style={styles.instructionsTitle}>How it works:</Text>
          <Text style={styles.instructionsText}>
            1. Tap a platform to browse recipes{'\n'}
            2. Find a recipe video you like{'\n'}
            3. Tap Share and select "Pantry App"{'\n'}
            4. We'll extract the ingredients for you!
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

interface PlatformCardProps {
  platform: SupportedPlatform;
  isOpening: boolean;
  onPress: () => void;
}

function PlatformCard({ platform, isOpening, onPress }: PlatformCardProps) {
  const displayName = getPlatformDisplayName(platform);
  const icon = getPlatformIcon(platform);

  return (
    <TouchableOpacity
      style={styles.platformCard}
      onPress={onPress}
      disabled={isOpening}
      activeOpacity={0.7}
    >
      {isOpening ? (
        <ActivityIndicator size="large" color="#007AFF" />
      ) : (
        <>
          <Text style={styles.platformIcon}>{icon}</Text>
          <Text style={styles.platformName}>{displayName}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollContent: {
    padding: 20,
  },
  header: {
    marginBottom: 30,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666666',
    lineHeight: 22,
  },
  platformGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 30,
  },
  platformCard: {
    width: '48%',
    aspectRatio: 1,
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  platformIcon: {
    fontSize: 48,
    marginBottom: 8,
  },
  platformName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    textAlign: 'center',
  },
  instructions: {
    backgroundColor: '#F0F8FF',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#B0D4FF',
  },
  instructionsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 12,
  },
  instructionsText: {
    fontSize: 14,
    color: '#333333',
    lineHeight: 22,
  },
});
