import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { theme } from '../../../core/constants/theme';
import { Input } from '../../../core/components/ui/Input';
import { Button } from '../../../core/components/ui/Button';
import { useAuth } from '../../../contexts/AuthContext';

export const AuthScreen: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [useMagicLink, setUseMagicLink] = useState(true);

  const { signInWithEmail, signInWithPassword, signUp, loading } = useAuth();

  const handleAuth = async () => {
    if (!email.trim()) {
      return;
    }

    if (useMagicLink) {
      await signInWithEmail(email);
    } else if (isSignUp) {
      await signUp(email, password, displayName);
    } else {
      await signInWithPassword(email, password);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Logo and Title */}
          <View style={styles.header}>
            <View style={styles.logoContainer}>
              <Text style={styles.logo}>🏠</Text>
            </View>
            <Text style={styles.title}>Pantry Pal</Text>
            <Text style={styles.subtitle}>Manage your food inventory smart</Text>
          </View>

          {/* Tab Selector */}
          <View style={styles.tabContainer}>
            <Pressable
              style={[styles.tab, useMagicLink && styles.activeTab]}
              onPress={() => {
                setUseMagicLink(true);
                setIsSignUp(false);
              }}
            >
              <Text style={[styles.tabText, useMagicLink && styles.activeTabText]}>
                Magic Link
              </Text>
            </Pressable>
            <Pressable
              style={[styles.tab, !useMagicLink && !isSignUp && styles.activeTab]}
              onPress={() => {
                setUseMagicLink(false);
                setIsSignUp(false);
              }}
            >
              <Text style={[styles.tabText, !useMagicLink && !isSignUp && styles.activeTabText]}>
                Password
              </Text>
            </Pressable>
            <Pressable
              style={[styles.tab, isSignUp && styles.activeTab]}
              onPress={() => {
                setUseMagicLink(false);
                setIsSignUp(true);
              }}
            >
              <Text style={[styles.tabText, isSignUp && styles.activeTabText]}>
                Sign Up
              </Text>
            </Pressable>
          </View>

          {/* Form */}
          <View style={styles.form}>
            {isSignUp && (
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Display Name</Text>
                <Input
                  placeholder="Enter your name"
                  value={displayName}
                  onChangeText={setDisplayName}
                  autoCapitalize="words"
                />
              </View>
            )}

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email</Text>
              <Input
                placeholder="Enter your email"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            {!useMagicLink && (
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Password</Text>
                <Input
                  placeholder="Enter your password"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  rightIcon={
                    <Pressable onPress={() => setShowPassword(!showPassword)}>
                      <Text style={styles.eyeIcon}>{showPassword ? '👁️' : '👁️‍🗨️'}</Text>
                    </Pressable>
                  }
                />
              </View>
            )}

            <Button
              variant="primary"
              fullWidth
              onPress={handleAuth}
              style={styles.signInButton}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={theme.colors.textInverse} />
              ) : useMagicLink ? (
                'Send Magic Link'
              ) : isSignUp ? (
                'Create Account'
              ) : (
                'Sign In'
              )}
            </Button>

            {useMagicLink && (
              <Text style={styles.helperText}>
                We'll send you a magic link to sign in. No password needed!
              </Text>
            )}

            {!useMagicLink && !isSignUp && (
              <View style={styles.linkContainer}>
                <Pressable>
                  <Text style={styles.link}>Forgot password?</Text>
                </Pressable>
              </View>
            )}
          </View>

          {/* Demo Mode */}
          <View style={styles.demoContainer}>
            <Text style={styles.demoText}>Just exploring?</Text>
            <Pressable style={styles.demoButton}>
              <Text style={styles.demoButtonText}>Try Demo Mode</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.xl,
  },
  header: {
    alignItems: 'center',
    marginTop: theme.spacing.xl,
    marginBottom: theme.spacing.xl,
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  logo: {
    fontSize: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  subtitle: {
    fontSize: 16,
    color: theme.colors.textSecondary,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.lg,
  },
  tab: {
    flex: 1,
    paddingVertical: theme.spacing.sm,
    alignItems: 'center',
  },
  activeTab: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.sm,
  },
  tabText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },
  activeTabText: {
    color: theme.colors.textInverse,
  },
  form: {
    marginBottom: theme.spacing.lg,
  },
  inputGroup: {
    marginBottom: theme.spacing.md,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  signInButton: {
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  linkContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  link: {
    fontSize: 14,
    color: theme.colors.primary,
    fontWeight: '500',
  },
  helperText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  demoContainer: {
    alignItems: 'center',
    marginTop: theme.spacing.xl,
    paddingTop: theme.spacing.lg,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  demoText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  demoButton: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  demoButtonText: {
    fontSize: 16,
    color: theme.colors.primary,
    fontWeight: '500',
  },
  eyeIcon: {
    fontSize: 20,
  },
});