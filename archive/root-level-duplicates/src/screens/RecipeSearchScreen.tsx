import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import api, { Recipe } from '../services/api';
import { config } from '../config';

export default function RecipeSearchScreen() {
  const [searchQuery, setSearchQuery] = useState('');
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(false);
  const [backendStatus, setBackendStatus] = useState<boolean | null>(null);

  useEffect(() => {
    checkBackend();
  }, []);

  const checkBackend = async () => {
    const isHealthy = await api.checkHealth();
    setBackendStatus(isHealthy);
    if (!isHealthy) {
      Alert.alert(
        'Backend Offline',
        `Cannot connect to recipe backend. Make sure the server is running on ${config.API_BASE_URL}`,
      );
    }
  };

  const searchRecipes = async () => {
    if (!searchQuery.trim()) return;

    setLoading(true);
    try {
      const response = await api.searchRecipes(searchQuery);
      setRecipes(response.items);
    } catch (error) {
      Alert.alert('Error', 'Failed to search recipes. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const renderRecipe = ({ item }: { item: Recipe }) => (
    <TouchableOpacity style={styles.recipeCard}>
      <Text style={styles.recipeTitle}>{item.title}</Text>
      <Text style={styles.recipeSummary} numberOfLines={2}>
        {item.summary}
      </Text>
      <View style={styles.recipeMetadata}>
        {item.total_time_min && (
          <Text style={styles.metadataText}>⏱️ {item.total_time_min} min</Text>
        )}
        {item.servings && (
          <Text style={styles.metadataText}>👥 {item.servings} servings</Text>
        )}
      </View>
      <Text style={styles.attribution}>{item.attribution_text}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Recipe Search</Text>
        <View style={styles.statusBadge}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: backendStatus ? '#10B981' : '#EF4444' },
            ]}
          />
          <Text style={styles.statusText}>
            {backendStatus ? 'Connected' : 'Offline'}
          </Text>
        </View>
      </View>

      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search for recipes..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={searchRecipes}
        />
        <TouchableOpacity style={styles.searchButton} onPress={searchRecipes}>
          <Text style={styles.searchButtonText}>Search</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#10B981" style={styles.loader} />
      ) : (
        <FlatList
          data={recipes}
          renderItem={renderRecipe}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          ListEmptyComponent={
            searchQuery ? (
              <Text style={styles.emptyText}>
                No recipes found. Try a different search term.
              </Text>
            ) : (
              <Text style={styles.emptyText}>
                Search for delicious recipes from our collection of 684 recipes!
              </Text>
            )
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: '#111827',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    fontSize: 12,
    color: '#6b7280',
  },
  searchContainer: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: 'white',
  },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 16,
    marginRight: 8,
  },
  searchButton: {
    backgroundColor: '#10B981',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
    justifyContent: 'center',
  },
  searchButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16,
  },
  loader: {
    marginTop: 50,
  },
  listContainer: {
    padding: 16,
  },
  recipeCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  recipeTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  recipeSummary: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 8,
  },
  recipeMetadata: {
    flexDirection: 'row',
    marginTop: 8,
    marginBottom: 8,
  },
  metadataText: {
    fontSize: 14,
    color: '#6b7280',
    marginRight: 16,
  },
  attribution: {
    fontSize: 12,
    color: '#9ca3af',
    fontStyle: 'italic',
  },
  emptyText: {
    textAlign: 'center',
    color: '#6b7280',
    fontSize: 16,
    marginTop: 50,
    paddingHorizontal: 32,
  },
});