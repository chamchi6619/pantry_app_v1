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
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { theme } from '../../../core/constants/theme';
import { Input } from '../../../core/components/ui/Input';
import { Button } from '../../../core/components/ui/Button';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../lib/supabase';

export const AuthScreen: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [useMagicLink, setUseMagicLink] = useState(true);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetEmail, setResetEmail] = useState('');

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

  const handleForgotPassword = () => {
    // Pre-fill with email from main form if available
    setResetEmail(email);
    setShowResetModal(true);
  };

  const sendPasswordResetEmail = async () => {
    if (!resetEmail.trim()) {
      Alert.alert('Email Required', 'Please enter your email address.');
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(resetEmail)) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.');
      return;
    }

    // Confirm with user
    Alert.alert(
      'Confirm Email',
      `Send password reset link to ${resetEmail}?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Send',
          onPress: async () => {
            try {
              const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
                redirectTo: 'pantrypal://reset-password',
              });

              if (error) throw error;

              // Close modal
              setShowResetModal(false);
              setResetEmail('');

              // Show success message
              Alert.alert(
                'Email Sent!',
                `Password reset instructions have been sent to ${resetEmail}. Please check your inbox.`
              );
            } catch (error: any) {
              console.error('Password reset error:', error);
              Alert.alert(
                'Error',
                error?.message || 'Failed to send password reset email. Please try again.'
              );
            }
          },
        },
      ]
    );
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
                <Pressable onPress={handleForgotPassword}>
                  <Text style={styles.link}>Forgot password?</Text>
                </Pressable>
              </View>
            )}
          </View>

        </ScrollView>
      </KeyboardAvoidingView>

      {/* Password Reset Modal */}
      <Modal
        visible={showResetModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowResetModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Reset Password</Text>
            <Text style={styles.modalDescription}>
              Enter your email address and we'll send you a link to reset your password.
            </Text>

            <TextInput
              style={styles.modalInput}
              placeholder="Email address"
              value={resetEmail}
              onChangeText={setResetEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoFocus
            />

            <View style={styles.modalButtons}>
              <Pressable
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => {
                  setShowResetModal(false);
                  setResetEmail('');
                }}
              >
                <Text style={styles.modalButtonTextCancel}>Cancel</Text>
              </Pressable>

              <Pressable
                style={[styles.modalButton, styles.modalButtonConfirm]}
                onPress={sendPasswordResetEmail}
              >
                <Text style={styles.modalButtonTextConfirm}>Send Reset Link</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
  eyeIcon: {
    fontSize: 20,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.xl,
    width: '85%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  modalDescription: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.lg,
    lineHeight: 20,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    fontSize: 16,
    marginBottom: theme.spacing.lg,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  modalButton: {
    flex: 1,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
  },
  modalButtonCancel: {
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  modalButtonConfirm: {
    backgroundColor: theme.colors.primary,
  },
  modalButtonTextCancel: {
    fontSize: 16,
    fontWeight: '500',
    color: theme.colors.text,
  },
  modalButtonTextConfirm: {
    fontSize: 16,
    fontWeight: '500',
    color: '#fff',
  },
});