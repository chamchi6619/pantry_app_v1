import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Button, Alert, Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { theme } from '../core/constants/theme';

export const SupabaseTestScreen: React.FC = () => {
  const { user, householdId } = useAuth();
  const [testResults, setTestResults] = useState<string[]>([]);
  const [testing, setTesting] = useState(false);

  const addTestResult = (result: string) => {
    setTestResults(prev => [...prev, result]);
  };

  const runTests = async () => {
    if (!user || !householdId) {
      Alert.alert('Not logged in', 'Please log in first');
      return;
    }

    setTesting(true);
    setTestResults([]);

    try {
      // Test 1: Check user profile
      addTestResult('Testing user profile...');
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profileError) {
        addTestResult(`❌ Profile error: ${profileError.message}`);
      } else {
        addTestResult(`✅ Profile found: ${profile.email}`);
      }

      // Test 2: Check household
      addTestResult('Testing household access...');
      const { data: household, error: householdError } = await supabase
        .from('households')
        .select('*')
        .eq('id', householdId)
        .single();

      if (householdError) {
        addTestResult(`❌ Household error: ${householdError.message}`);
      } else {
        addTestResult(`✅ Household found: ${household.name}`);
      }

      // Test 3: Add test pantry item
      addTestResult('Testing pantry item creation...');
      const testItem = {
        household_id: householdId,
        name: `Test Item ${Date.now()}`,
        quantity: 1,
        unit: 'piece',
        location: 'pantry' as const,
        category: 'Test',
        notes: 'This is a test item',
      };

      const { data: newItem, error: addError } = await supabase
        .from('pantry_items')
        .insert(testItem)
        .select()
        .single();

      if (addError) {
        addTestResult(`❌ Add item error: ${addError.message}`);
      } else {
        addTestResult(`✅ Item created: ${newItem.name} (ID: ${newItem.id})`);

        // Test 4: Update the item
        addTestResult('Testing item update...');
        const { error: updateError } = await supabase
          .from('pantry_items')
          .update({ quantity: 2 })
          .eq('id', newItem.id);

        if (updateError) {
          addTestResult(`❌ Update error: ${updateError.message}`);
        } else {
          addTestResult(`✅ Item updated successfully`);
        }

        // Test 5: Delete the item
        addTestResult('Testing item deletion...');
        const { error: deleteError } = await supabase
          .from('pantry_items')
          .update({ status: 'consumed' })
          .eq('id', newItem.id);

        if (deleteError) {
          addTestResult(`❌ Delete error: ${deleteError.message}`);
        } else {
          addTestResult(`✅ Item marked as consumed`);
        }
      }

      // Test 6: Check shopping list
      addTestResult('Testing shopping list...');
      const { data: shoppingList, error: listError } = await supabase
        .from('shopping_lists')
        .select('*')
        .eq('household_id', householdId)
        .eq('is_active', true)
        .single();

      if (listError && listError.code !== 'PGRST116') {
        addTestResult(`❌ Shopping list error: ${listError.message}`);
      } else if (shoppingList) {
        addTestResult(`✅ Shopping list found: ${shoppingList.title}`);
      } else {
        addTestResult('⚠️ No active shopping list found');
      }

      addTestResult('✨ All tests completed!');
    } catch (error: any) {
      addTestResult(`❌ Unexpected error: ${error.message}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Supabase Connection Test</Text>
        <Text style={styles.subtitle}>User: {user?.email || 'Not logged in'}</Text>
        <Text style={styles.subtitle}>Household ID: {householdId || 'None'}</Text>
      </View>

      <View style={styles.buttonContainer}>
        <Button
          title={testing ? 'Testing...' : 'Run Tests'}
          onPress={runTests}
          disabled={testing || !user}
          color={theme.colors.primary}
        />
      </View>

      <View style={styles.resultsContainer}>
        {testResults.map((result, index) => (
          <Text key={index} style={styles.result}>
            {result}
          </Text>
        ))}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    padding: theme.spacing.lg,
  },
  header: {
    marginBottom: theme.spacing.xl,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  subtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  buttonContainer: {
    marginBottom: theme.spacing.lg,
  },
  resultsContainer: {
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    minHeight: 200,
  },
  result: {
    fontSize: 12,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
});