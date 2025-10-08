import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Import all versions
import { ProfileScreenV1 } from './ProfileScreen.v1';
import { ProfileScreenV2 } from './ProfileScreen.v2';
import { ProfileScreenV3 } from './ProfileScreen.v3';
import { ProfileScreenV4 } from './ProfileScreen.v4';
import { ProfileScreenV5 } from './ProfileScreen.v5';

export const ProfileScreen: React.FC = () => {
  const [selectedVersion, setSelectedVersion] = useState<1 | 2 | 3 | 4 | 5>(5);

  const renderVersion = () => {
    switch (selectedVersion) {
      case 1:
        return <ProfileScreenV1 />;
      case 2:
        return <ProfileScreenV2 />;
      case 3:
        return <ProfileScreenV3 />;
      case 4:
        return <ProfileScreenV4 />;
      case 5:
        return <ProfileScreenV5 />;
      default:
        return <ProfileScreenV5 />;
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Version Tabs */}
      <View style={styles.tabBar}>
        {[1, 2, 3, 4, 5].map((version) => (
          <Pressable
            key={version}
            style={[
              styles.tab,
              selectedVersion === version && styles.tabActive,
            ]}
            onPress={() => setSelectedVersion(version as 1 | 2 | 3 | 4 | 5)}
          >
            <Text
              style={[
                styles.tabText,
                selectedVersion === version && styles.tabTextActive,
              ]}
            >
              v{version}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Render Selected Version */}
      <View style={styles.content}>{renderVersion()}</View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  tabActive: {
    backgroundColor: '#059669',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  tabTextActive: {
    color: '#FFFFFF',
  },
  content: {
    flex: 1,
  },
});
