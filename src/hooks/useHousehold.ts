import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

interface Household {
  id: string;
  name: string;
  type: string;
  created_by: string;
  created_at: string;
}

interface HouseholdMember {
  id: string;
  household_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  can_edit_inventory: boolean;
  can_edit_shopping: boolean;
}

interface HouseholdState {
  currentHousehold: Household | null;
  households: Household[];
  members: HouseholdMember[];
  loading: boolean;
  error: Error | null;
}

export function useHousehold() {
  const { user } = useAuth();
  const [state, setState] = useState<HouseholdState>({
    currentHousehold: null,
    households: [],
    members: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (user) {
      loadHouseholds();
    } else {
      setState({
        currentHousehold: null,
        households: [],
        members: [],
        loading: false,
        error: null,
      });
    }
  }, [user]);

  const loadHouseholds = async () => {
    if (!user) return;

    try {
      setState((prev) => ({ ...prev, loading: true, error: null }));

      // Get user's households
      const { data: memberships, error: memberError } = await supabase
        .from('household_members')
        .select(`
          *,
          household:households(*)
        `)
        .eq('user_id', user.id);

      if (memberError) throw memberError;

      const households = memberships.map((m: any) => m.household);
      const currentHousehold = households[0] || null;

      // If we have a current household, get all members
      let members: HouseholdMember[] = [];
      if (currentHousehold) {
        const { data: householdMembers, error: membersError } = await supabase
          .from('household_members')
          .select(`
            *,
            profile:profiles(display_name, email)
          `)
          .eq('household_id', currentHousehold.id);

        if (membersError) throw membersError;
        members = householdMembers || [];
      }

      setState({
        currentHousehold,
        households,
        members,
        loading: false,
        error: null,
      });
    } catch (error) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: error as Error,
      }));
    }
  };

  const createHousehold = async (name: string, type: string = 'family') => {
    if (!user) throw new Error('No user logged in');

    try {
      // Create household
      const { data: household, error: householdError } = await supabase
        .from('households')
        .insert({ name, type, created_by: user.id })
        .select()
        .single();

      if (householdError) throw householdError;

      // Add user as owner
      const { error: memberError } = await supabase
        .from('household_members')
        .insert({
          household_id: household.id,
          user_id: user.id,
          role: 'owner',
        });

      if (memberError) throw memberError;

      // Reload households
      await loadHouseholds();

      return household;
    } catch (error) {
      throw error;
    }
  };

  const switchHousehold = async (householdId: string) => {
    const household = state.households.find((h) => h.id === householdId);
    if (!household) throw new Error('Household not found');

    // Get members for the new household
    const { data: members, error } = await supabase
      .from('household_members')
      .select(`
        *,
        profile:profiles(display_name, email)
      `)
      .eq('household_id', householdId);

    if (error) throw error;

    setState((prev) => ({
      ...prev,
      currentHousehold: household,
      members: members || [],
    }));
  };

  const inviteMember = async (email: string, role: string = 'member') => {
    if (!state.currentHousehold) throw new Error('No household selected');
    if (!user) throw new Error('No user logged in');

    try {
      // Create invite (in production, would send email)
      const { data: invite, error } = await supabase
        .from('household_invites')
        .insert({
          household_id: state.currentHousehold.id,
          email,
          role,
          invited_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return invite;
    } catch (error) {
      throw error;
    }
  };

  const removeMember = async (userId: string) => {
    if (!state.currentHousehold) throw new Error('No household selected');

    try {
      const { error } = await supabase
        .from('household_members')
        .delete()
        .eq('household_id', state.currentHousehold.id)
        .eq('user_id', userId);

      if (error) throw error;

      // Reload members
      await loadHouseholds();
    } catch (error) {
      throw error;
    }
  };

  const updateMemberRole = async (userId: string, role: string) => {
    if (!state.currentHousehold) throw new Error('No household selected');

    try {
      const { error } = await supabase
        .from('household_members')
        .update({ role })
        .eq('household_id', state.currentHousehold.id)
        .eq('user_id', userId);

      if (error) throw error;

      // Reload members
      await loadHouseholds();
    } catch (error) {
      throw error;
    }
  };

  const getUserRole = (): string | null => {
    if (!user || !state.currentHousehold) return null;

    const member = state.members.find((m) => m.user_id === user.id);
    return member?.role || null;
  };

  const canEdit = (): boolean => {
    const role = getUserRole();
    return role === 'owner' || role === 'admin' || role === 'member';
  };

  return {
    ...state,
    createHousehold,
    switchHousehold,
    inviteMember,
    removeMember,
    updateMemberRole,
    getUserRole,
    canEdit,
    reload: loadHouseholds,
  };
}