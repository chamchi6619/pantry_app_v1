import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export interface UserPreferences {
  user_id: string;
  measurement_system: 'imperial' | 'metric';
  default_location: 'fridge' | 'freezer' | 'pantry';
  currency: string;
  expiry_warning_days: number;
  low_stock_threshold: number;
  enable_notifications: boolean;
  dietary_restrictions: {
    allergens: string[];
    diets: string[];
    dislikes: string[];
  };
  updated_at: string;
}

export interface UserProfile {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  timezone: string;
  locale: string;
  onboarding_completed: boolean;
}

export function useUserPreferences() {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      loadUserData();
    } else {
      setPreferences(null);
      setProfile(null);
      setLoading(false);
    }
  }, [user]);

  const loadUserData = async () => {
    if (!user) return;

    try {
      setLoading(true);
      setError(null);

      // Load profile
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profileError) throw profileError;
      setProfile(profileData);

      // Load preferences
      const { data: prefsData, error: prefsError } = await supabase
        .from('user_preferences')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (prefsError) {
        // If no preferences exist, create defaults
        if (prefsError.code === 'PGRST116') {
          const { data: newPrefs, error: createError } = await supabase
            .from('user_preferences')
            .insert({ user_id: user.id })
            .select()
            .single();

          if (createError) throw createError;
          setPreferences(newPrefs);
        } else {
          throw prefsError;
        }
      } else {
        setPreferences(prefsData);
      }
    } catch (err: any) {
      console.error('Error loading user data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const updatePreferences = async (updates: Partial<UserPreferences>) => {
    if (!user) return;

    try {
      setError(null);

      const { error: updateError } = await supabase
        .from('user_preferences')
        .update(updates)
        .eq('user_id', user.id);

      if (updateError) throw updateError;

      // Reload preferences
      await loadUserData();
    } catch (err: any) {
      console.error('Error updating preferences:', err);
      setError(err.message);
      throw err;
    }
  };

  const updateProfile = async (updates: Partial<UserProfile>) => {
    if (!user) return;

    try {
      setError(null);

      const { error: updateError } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user.id);

      if (updateError) throw updateError;

      // Reload profile
      await loadUserData();
    } catch (err: any) {
      console.error('Error updating profile:', err);
      setError(err.message);
      throw err;
    }
  };

  return {
    preferences,
    profile,
    loading,
    error,
    updatePreferences,
    updateProfile,
    refresh: loadUserData,
  };
}
