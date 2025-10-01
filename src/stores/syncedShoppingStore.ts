import { create } from 'zustand';
import { supabase } from '../lib/supabase';

interface ShoppingItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  category: string;
  checked: boolean;
  pantryItemId?: string;
}

interface SyncedShoppingStore {
  items: ShoppingItem[];
  listId: string | null;
  householdId: string | null;
  loading: boolean;
  error: string | null;

  // Initialize store with household
  initialize: (householdId: string) => Promise<void>;

  // CRUD operations
  addItem: (item: Omit<ShoppingItem, 'id'>) => Promise<void>;
  updateItem: (id: string, updates: Partial<ShoppingItem>) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  toggleItem: (id: string) => Promise<void>;

  // Bulk operations
  clearChecked: () => Promise<void>;
  moveCheckedToInventory: () => Promise<void>;

  // Sync operations
  refreshItems: () => Promise<void>;
}

export const useSyncedShoppingStore = create<SyncedShoppingStore>((set, get) => ({
  items: [],
  listId: null,
  householdId: null,
  loading: false,
  error: null,

  initialize: async (householdId: string) => {
    set({ loading: true, error: null, householdId });

    try {
      // Get or create active shopping list
      let { data: list, error: listError } = await supabase
        .from('shopping_lists')
        .select('*')
        .eq('household_id', householdId)
        .eq('is_active', true)
        .single();

      if (listError || !list) {
        // Create new list
        const { data: newList, error: createError } = await supabase
          .from('shopping_lists')
          .insert({
            household_id: householdId,
            title: 'Shopping List',
            is_active: true
          })
          .select()
          .single();

        if (createError) throw createError;
        list = newList;
      }

      // Load items
      const { data: items, error: itemsError } = await supabase
        .from('shopping_list_items')
        .select('*')
        .eq('list_id', list.id)
        .order('created_at');

      if (itemsError) throw itemsError;

      set({
        listId: list.id,
        items: (items || []).map(item => ({
          id: item.id,
          name: item.name,
          quantity: item.quantity || 1,
          unit: item.unit || 'pcs',
          category: item.category || 'Other',
          checked: item.checked || false,
          pantryItemId: item.pantry_item_id
        })),
        loading: false
      });

      // Set up realtime subscription
      const subscription = supabase
        .channel(`shopping_list_${list.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'shopping_list_items',
            filter: `list_id=eq.${list.id}`
          },
          () => {
            // Refresh items on any change
            get().refreshItems();
          }
        )
        .subscribe();

      // Cleanup subscription on unmount
      return () => {
        subscription.unsubscribe();
      };
    } catch (error) {
      console.error('Failed to initialize shopping list:', error);
      set({ error: error.message, loading: false });
    }
  },

  addItem: async (item) => {
    const { listId, householdId } = get();
    if (!listId || !householdId) return;

    try {
      const { data, error } = await supabase
        .from('shopping_list_items')
        .insert({
          list_id: listId,
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          category: item.category,
          checked: false,
          pantry_item_id: item.pantryItemId
        })
        .select()
        .single();

      if (error) throw error;

      set(state => ({
        items: [...state.items, {
          id: data.id,
          name: data.name,
          quantity: data.quantity,
          unit: data.unit,
          category: data.category,
          checked: data.checked,
          pantryItemId: data.pantry_item_id
        }]
      }));
    } catch (error) {
      console.error('Failed to add shopping item:', error);
      set({ error: error.message });
    }
  },

  updateItem: async (id: string, updates: Partial<ShoppingItem>) => {
    try {
      const { error } = await supabase
        .from('shopping_list_items')
        .update({
          name: updates.name,
          quantity: updates.quantity,
          unit: updates.unit,
          category: updates.category,
          checked: updates.checked
        })
        .eq('id', id);

      if (error) throw error;

      set(state => ({
        items: state.items.map(item =>
          item.id === id ? { ...item, ...updates } : item
        )
      }));
    } catch (error) {
      console.error('Failed to update shopping item:', error);
      set({ error: error.message });
    }
  },

  deleteItem: async (id: string) => {
    try {
      const { error } = await supabase
        .from('shopping_list_items')
        .delete()
        .eq('id', id);

      if (error) throw error;

      set(state => ({
        items: state.items.filter(item => item.id !== id)
      }));
    } catch (error) {
      console.error('Failed to delete shopping item:', error);
      set({ error: error.message });
    }
  },

  toggleItem: async (id: string) => {
    const item = get().items.find(i => i.id === id);
    if (!item) return;

    await get().updateItem(id, { checked: !item.checked });
  },

  clearChecked: async () => {
    const { items } = get();
    const checkedIds = items.filter(i => i.checked).map(i => i.id);

    if (checkedIds.length === 0) return;

    try {
      const { error } = await supabase
        .from('shopping_list_items')
        .delete()
        .in('id', checkedIds);

      if (error) throw error;

      set(state => ({
        items: state.items.filter(item => !item.checked)
      }));
    } catch (error) {
      console.error('Failed to clear checked items:', error);
      set({ error: error.message });
    }
  },

  moveCheckedToInventory: async () => {
    const { items, householdId } = get();
    const checkedItems = items.filter(i => i.checked);

    if (checkedItems.length === 0 || !householdId) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Add to pantry
      for (const item of checkedItems) {
        await supabase
          .from('pantry_items')
          .insert({
            household_id: householdId,
            name: item.name,
            quantity: item.quantity,
            unit: item.unit,
            category: item.category,
            location: 'pantry',
            source: 'shopping_list',
            added_by: user.id
          });
      }

      // Clear from shopping list
      await get().clearChecked();
    } catch (error) {
      console.error('Failed to move items to inventory:', error);
      set({ error: error.message });
    }
  },

  refreshItems: async () => {
    const { listId } = get();
    if (!listId) return;

    try {
      const { data: items, error } = await supabase
        .from('shopping_list_items')
        .select('*')
        .eq('list_id', listId)
        .order('created_at');

      if (error) throw error;

      set({
        items: (items || []).map(item => ({
          id: item.id,
          name: item.name,
          quantity: item.quantity || 1,
          unit: item.unit || 'pcs',
          category: item.category || 'Other',
          checked: item.checked || false,
          pantryItemId: item.pantry_item_id
        }))
      });
    } catch (error) {
      console.error('Failed to refresh items:', error);
      set({ error: error.message });
    }
  }
}));