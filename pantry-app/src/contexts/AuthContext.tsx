import React, { createContext, useState, useEffect, useContext } from 'react';
import { Alert } from 'react-native';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { FEATURE_FLAGS } from '../config/featureFlags';
import { trackEvent } from '../services/analyticsService';
import { identifyUser, logOutPurchases } from '../services/purchaseService';
import { syncService } from '../services/supabaseSync';
import { useReceiptStore } from '../stores/receiptStore';
import { useInventoryStore } from '../stores/inventoryStore';
import { useShoppingListStore } from '../stores/shoppingListStore';
import { canonicalItemsService } from '../services/canonicalItemsService';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  hasProfile: boolean;
  householdId: string | null;
  isInitialized: boolean;
  syncStatus: 'idle' | 'syncing' | 'error' | 'success';

  // Auth methods
  signInWithEmail: (email: string) => Promise<void>;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName?: string) => Promise<void>;
  signOut: () => Promise<void>;

  // Household methods
  setHouseholdId: (id: string) => void;
  refreshHousehold: () => Promise<void>;

  // Sync methods
  initializeSync: () => Promise<void>;
  getSyncStatus: () => 'idle' | 'syncing' | 'error' | 'success';
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasProfile, setHasProfile] = useState(false);
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'error' | 'success'>('idle');

  useEffect(() => {
    initializeAuth();
  }, []);

  const initializeAuth = async () => {
    try {
      console.log('[Auth] Starting initialization...');

      // Initialize canonical items service in background (for ingredient matching)
      canonicalItemsService.initialize().catch(err =>
        console.warn('[Auth] Failed to initialize canonical items:', err)
      );

      // Check for existing session
      const { data: { session }, error } = await supabase.auth.getSession();

      console.log('[Auth] Session check result:', {
        hasSession: !!session,
        sessionUser: session?.user?.email || 'none',
        error: error?.message || 'none'
      });

      if (error) {
        console.log('[Auth] Session error:', error.message);
        // Clear invalid session
        await supabase.auth.signOut();
        setSession(null);
        setUser(null);
        setHasProfile(false);
        setIsInitialized(true);
        setLoading(false);
        return;
      }

      console.log('[Auth] Session check complete:', session ? 'Has session' : 'No session');

      if (session) {
        setSession(session);
        setUser(session.user);
        await initializeUserData(session.user.id);
        // Set initialized after user data is loaded
        setIsInitialized(true);
        setLoading(false);
      } else {
        // No session, user needs to sign in
        console.log('[Auth] No session, setting initialized');
        setIsInitialized(true);
        setLoading(false);
      }

      // Listen for auth changes
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        async (_event, session) => {
          setSession(session);
          setUser(session?.user ?? null);

          if (session?.user) {
            await initializeUserData(session.user.id);
            identifyUser(session.user.id);
          } else {
            // Clean up on logout
            setHasProfile(false);
            setHouseholdId(null);
            // Don't reset isInitialized - we're still initialized, just logged out
            setSyncStatus('idle');
            syncService.cleanup();
          }
        }
      );

      return () => subscription.unsubscribe();
    } catch (error) {
      console.error('Auth initialization error:', error);
      setSession(null);
      setUser(null);
      setHasProfile(false);
      setIsInitialized(true);
      setLoading(false);
    }
  };

  const initializeUserData = async (userId: string) => {
    try {
      // First check if profile exists
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', userId)
        .single();

      setHasProfile(!!profile);

      if (!profile) {
        console.log(`[Auth] No profile found for user ${userId}`);
        setIsInitialized(true);
        return;
      }

      // Fetch user's household
      let household = await fetchUserHousehold(userId);
      console.log(`[Auth] Fetched household: ${household} for user: ${userId}`);

      // If no household exists, force create one
      if (!household) {
        console.log(`[Auth] No household found, creating one...`);
        const { data: newHousehold, error } = await supabase.rpc('get_or_create_household');
        if (!error && newHousehold) {
          household = newHousehold;
          console.log(`[Auth] Created household: ${household}`);
        } else {
          console.error(`[Auth] Failed to create household:`, error);
        }
      }

      if (household) {
        setHouseholdId(household);

        // Initialize sync if enabled
        if (FEATURE_FLAGS.SYNC_MODE_INVENTORY !== 'off' || FEATURE_FLAGS.SYNC_MODE_SHOPPING !== 'off') {
          console.log(`[Auth] Sync modes enabled, initializing sync...`);
          await initializeSync();
        }
      }

      setIsInitialized(true);
    } catch (error) {
      console.error('Error initializing user data:', error);
      setIsInitialized(false);
    }
  };

  const fetchUserHousehold = async (userId: string): Promise<string | null> => {
    try {
      // Get user's household
      const { data, error } = await supabase
        .from('household_members')
        .select('household_id')
        .eq('user_id', userId)
        .single();

      if (error) {
        // If no household found, it might be created by trigger
        // Try to create one explicitly
        if (error.code === 'PGRST116') {
          const { data: newHousehold, error: createError } = await supabase.rpc(
            'get_or_create_household'
          );

          if (!createError && newHousehold) {
            return newHousehold;
          }
        }
        throw error;
      }

      return data?.household_id ?? null;
    } catch (error) {
      console.error('Error fetching household:', error);
      return null;
    }
  };

  const refreshHousehold = async () => {
    if (!user) return;

    const household = await fetchUserHousehold(user.id);
    if (household) {
      setHouseholdId(household);
    }
  };

  const initializeSync = async () => {
    if (!householdId) return;

    try {
      setSyncStatus('syncing');
      await syncService.initialize(householdId);
      setSyncStatus('success');

      // Process any queued operations
      if (FEATURE_FLAGS.ENABLE_OFFLINE_QUEUE) {
        await syncService.processQueue();
      }
    } catch (error) {
      console.error('Sync initialization failed:', error);
      setSyncStatus('error');
    }
  };

  const signInWithEmail = async (email: string) => {
    try {
      setLoading(true);
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
        },
      });

      if (error) throw error;

      Alert.alert(
        'Check your email!',
        'We sent you a magic link to sign in. Please check your email.',
        [{ text: 'OK' }]
      );
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  const signInWithPassword = async (email: string, password: string) => {
    try {
      setLoading(true);
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  const signUp = async (email: string, password: string, displayName?: string) => {
    try {
      setLoading(true);
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            display_name: displayName,
          },
        },
      });

      if (error) throw error;

      trackEvent('sign_up_completed', { method: 'email_password' });

      Alert.alert(
        'Success!',
        'Please check your email to confirm your account.',
        [{ text: 'OK' }]
      );
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    try {
      setLoading(true);

      // Log out from RevenueCat
      await logOutPurchases();

      // Clean up sync before signing out
      syncService.cleanup();

      // Clear all persisted stores to prevent data leakage between users
      console.log('[Auth] Clearing all persisted stores...');
      useReceiptStore.getState().clearAll();
      useInventoryStore.getState().clearAll();
      useShoppingListStore.getState().clearAll();

      const { error } = await supabase.auth.signOut();
      if (error) throw error;

      // Force clear all auth state immediately
      setSession(null);
      setUser(null);
      setHasProfile(false);
      setHouseholdId(null);

      console.log('[Auth] User signed out successfully');
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  const getSyncStatus = () => syncStatus;

  const value = {
    session,
    user,
    loading,
    hasProfile,
    householdId,
    isInitialized,
    syncStatus,
    signInWithEmail,
    signInWithPassword,
    signUp,
    signOut,
    setHouseholdId,
    refreshHousehold,
    initializeSync,
    getSyncStatus,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};