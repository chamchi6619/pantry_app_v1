import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../../../core/constants/theme';
import { useAuth } from '../../../contexts/AuthContext';
import { useHousehold } from '../../../hooks/useHousehold';

export const ProfileScreen: React.FC = () => {
  const { signOut, user } = useAuth();
  const { currentHousehold, householdMembers } = useHousehold();

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header: User + Household */}
        <View style={styles.header}>
          <Text style={styles.title}>Profile</Text>

          <View style={styles.avatar}>
            <Text style={styles.avatarText}>👤</Text>
          </View>

          <Text style={styles.userName}>{user?.email?.split('@')[0] || 'User'}</Text>
          <Text style={styles.userEmail}>{user?.email || 'Not signed in'}</Text>

          {currentHousehold && (
            <View style={styles.householdInfo}>
              <Text style={styles.householdIcon}>🏠</Text>
              <View>
                <Text style={styles.householdName}>{currentHousehold.name}</Text>
                <Text style={styles.householdMembers}>
                  {householdMembers?.length || 0} member{householdMembers?.length !== 1 ? 's' : ''}
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* Placeholder for future cards (Phase 2+) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Dashboard</Text>
          <View style={styles.placeholderCard}>
            <Text style={styles.placeholderIcon}>📊</Text>
            <Text style={styles.placeholderText}>Spending and waste tracking coming soon!</Text>
            <Text style={styles.placeholderSubtext}>Continue scanning receipts to build your history.</Text>
          </View>
        </View>

        {/* Settings Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Settings</Text>

          <Pressable style={styles.settingRow} disabled>
            <Text style={styles.settingIcon}>📊</Text>
            <Text style={styles.settingText}>Export Data</Text>
            <Text style={styles.comingSoonBadge}>Coming Soon</Text>
          </Pressable>

          <Pressable style={styles.settingRow} disabled>
            <Text style={styles.settingIcon}>ℹ️</Text>
            <Text style={styles.settingText}>About</Text>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        </View>

        {/* Sign Out Button */}
        <View style={styles.section}>
          <Pressable style={styles.signOutButton} onPress={signOut}>
            <Text style={styles.signOutText}>Sign Out</Text>
          </Pressable>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Version 1.0.0</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    alignItems: 'center',
    paddingVertical: theme.spacing.xl,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  title: {
    ...theme.typography.h2,
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: theme.colors.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  avatarText: {
    fontSize: 40,
  },
  userName: {
    ...theme.typography.h3,
    color: theme.colors.text,
    fontWeight: '600',
    marginBottom: theme.spacing.xs,
  },
  userEmail: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
  },
  householdInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    marginTop: theme.spacing.sm,
  },
  householdIcon: {
    fontSize: 24,
    marginRight: theme.spacing.sm,
  },
  householdName: {
    ...theme.typography.body,
    color: theme.colors.text,
    fontWeight: '600',
  },
  householdMembers: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  section: {
    paddingHorizontal: theme.spacing.md,
    marginTop: theme.spacing.lg,
  },
  sectionTitle: {
    ...theme.typography.h3,
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  placeholderCard: {
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.xl,
    borderRadius: theme.borderRadius.lg,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: theme.colors.border,
    borderStyle: 'dashed',
  },
  placeholderIcon: {
    fontSize: 48,
    marginBottom: theme.spacing.md,
  },
  placeholderText: {
    ...theme.typography.body,
    color: theme.colors.text,
    textAlign: 'center',
    marginBottom: theme.spacing.xs,
  },
  placeholderSubtext: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.sm,
  },
  settingIcon: {
    fontSize: 20,
    marginRight: theme.spacing.md,
  },
  settingText: {
    ...theme.typography.body,
    color: theme.colors.text,
    flex: 1,
  },
  chevron: {
    fontSize: 16,
    color: theme.colors.textSecondary,
  },
  comingSoonBadge: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
    fontStyle: 'italic',
  },
  signOutButton: {
    backgroundColor: theme.colors.error,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
  },
  signOutText: {
    ...theme.typography.body,
    color: '#fff',
    fontWeight: '600',
  },
  footer: {
    alignItems: 'center',
    paddingVertical: theme.spacing.xl,
    paddingBottom: theme.spacing.xl * 2,
  },
  footerText: {
    ...theme.typography.caption,
    color: theme.colors.textLight,
  },
});