import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { FEATURE_FLAGS } from '../config/featureFlags';

export interface ReceiptItem {
  id?: string;
  name: string;
  rawText?: string;
  displayName?: string;
  quantity: number;
  unit: string;
  price?: number;
  category?: string;
  confidence?: number;
  needsReview?: boolean;
  location?: 'fridge' | 'freezer' | 'pantry';
}

export interface Receipt {
  id: string;
  date: string;
  storeName: string;
  totalAmount: number;
  currency?: string;
  items: ReceiptItem[];
  createdAt: string;
  scannedImageUri?: string;
  ocrConfidence?: number;
  householdId?: string;

  // Sync metadata
  syncStatus?: 'synced' | 'pending' | 'error';
  lastSyncedAt?: string;
}

export interface FixQueueItem {
  id: string;
  receiptId?: string;
  rawText: string;
  parsedName: string;
  quantity: number;
  unit: string;
  price?: number;
  category?: string;
  confidence: number;
  resolved: boolean;
  linkedItemId?: string;
  createdAt: string;

  // Sync metadata
  syncStatus?: 'synced' | 'pending' | 'error';
  lastSyncedAt?: string;
}

interface ReceiptState {
  // Data
  receipts: Receipt[];
  fixQueueItems: FixQueueItem[];

  // Sync State
  isLoading: boolean;
  isSyncing: boolean;
  syncError: string | null;
  lastSync: Date | null;
  householdId: string | null;

  // Actions - Local
  setReceipts: (receipts: Receipt[]) => void;
  setFixQueueItems: (items: FixQueueItem[]) => void;

  // Actions - Sync
  initialize: (householdId: string) => Promise<void>;
  loadFromSupabase: () => Promise<void>;

  // Receipt actions
  addReceipt: (receipt: Omit<Receipt, 'id' | 'createdAt'>) => Promise<Receipt | null>;
  updateReceipt: (id: string, updates: Partial<Receipt>) => Promise<void>;
  deleteReceipt: (id: string) => Promise<void>;

  // Fix queue actions
  addToFixQueue: (items: Omit<FixQueueItem, 'id' | 'createdAt'>[]) => Promise<void>;
  resolveFixQueueItem: (id: string, itemData: any) => Promise<void>;
  clearFixQueue: () => Promise<void>;

  // Process receipt OCR
  processOCRResult: (ocrData: any, imageUri?: string) => Promise<Receipt | null>;

  // Computed
  getReceiptById: (id: string) => Receipt | undefined;
  getReceiptsByDateRange: (startDate: Date, endDate: Date) => Receipt[];
  getTotalSpent: () => number;
  getReceiptCount: () => number;
  getRecentReceipts: (limit?: number) => Receipt[];
  getPendingFixQueueItems: () => FixQueueItem[];
}

// Mock data for offline/demo mode
const getMockReceipts = (): Receipt[] => [];
const getMockFixQueue = (): FixQueueItem[] => [];

export const useReceiptSupabaseStore = create<ReceiptState>()(
  persist(
    (set, get) => ({
      // Initial state
      receipts: FEATURE_FLAGS.SAVE_RECEIPTS_TO_DB ? [] : getMockReceipts(),
      fixQueueItems: FEATURE_FLAGS.SAVE_RECEIPTS_TO_DB ? [] : getMockFixQueue(),

      isLoading: false,
      isSyncing: false,
      syncError: null,
      lastSync: null,
      householdId: null,

      // Local actions
      setReceipts: (receipts) => set({ receipts }),
      setFixQueueItems: (items) => set({ fixQueueItems: items }),

      // Initialize with household
      initialize: async (householdId: string) => {
        set({ householdId, isLoading: true, syncError: null });

        if (!FEATURE_FLAGS.SAVE_RECEIPTS_TO_DB) {
          // Use mock data if sync is disabled
          set({
            receipts: getMockReceipts(),
            fixQueueItems: getMockFixQueue(),
            isLoading: false
          });
          return;
        }

        try {
          await get().loadFromSupabase();
        } catch (error: any) {
          console.error('Failed to initialize receipts:', error);
          set({ syncError: error.message });
        } finally {
          set({ isLoading: false });
        }
      },

      // Load from Supabase
      loadFromSupabase: async () => {
        const { householdId } = get();
        if (!householdId || !FEATURE_FLAGS.SAVE_RECEIPTS_TO_DB) return;

        set({ isLoading: true, syncError: null });

        try {
          // Load receipts
          const { data: receiptsData, error: receiptsError } = await supabase
            .from('receipts')
            .select('*')
            .eq('household_id', householdId)
            .order('created_at', { ascending: false });

          if (receiptsError) throw receiptsError;

          // Load fix queue items
          const { data: fixQueueData, error: fixQueueError } = await supabase
            .from('fix_queue')
            .select('*')
            .eq('household_id', householdId)
            .eq('resolved', false)
            .order('created_at', { ascending: false });

          if (fixQueueError) throw fixQueueError;

          // Transform and set data
          const receipts: Receipt[] = (receiptsData || []).map(r => ({
            id: r.id,
            date: r.receipt_date,
            storeName: r.store_name,
            totalAmount: Number(r.total_amount),
            currency: r.currency,
            items: r.items || [],
            createdAt: r.created_at,
            scannedImageUri: r.image_url,
            ocrConfidence: r.ocr_confidence,
            householdId: r.household_id,
            syncStatus: 'synced',
            lastSyncedAt: new Date().toISOString(),
          }));

          const fixQueueItems: FixQueueItem[] = (fixQueueData || []).map(item => ({
            id: item.id,
            receiptId: item.receipt_id,
            rawText: item.raw_text,
            parsedName: item.parsed_name,
            quantity: Number(item.quantity),
            unit: item.unit,
            price: item.price ? Number(item.price) : undefined,
            category: item.categories,
            confidence: item.confidence,
            resolved: item.resolved,
            linkedItemId: item.linked_item_id,
            createdAt: item.created_at,
            syncStatus: 'synced',
            lastSyncedAt: new Date().toISOString(),
          }));

          set({
            receipts,
            fixQueueItems,
            lastSync: new Date()
          });
        } catch (error: any) {
          console.error('Error loading receipts:', error);
          set({ syncError: error.message });
        } finally {
          set({ isLoading: false });
        }
      },

      // Add receipt with sync
      addReceipt: async (receiptData) => {
        const { householdId, receipts } = get();

        // Create optimistic receipt
        const tempId = `temp-${Date.now()}`;
        const newReceipt: Receipt = {
          ...receiptData,
          id: tempId,
          createdAt: new Date().toISOString(),
          householdId,
          syncStatus: FEATURE_FLAGS.SAVE_RECEIPTS_TO_DB ? 'pending' : 'synced',
        };

        // Update local state immediately
        set({ receipts: [newReceipt, ...receipts] });

        if (!FEATURE_FLAGS.SAVE_RECEIPTS_TO_DB || !householdId) {
          // If sync is disabled, just use local ID
          newReceipt.id = Date.now().toString();
          newReceipt.syncStatus = 'synced';
          set({ receipts: [newReceipt, ...receipts.slice(1)] });
          return newReceipt;
        }

        // Sync to Supabase
        set({ isSyncing: true });

        try {
          const { data, error } = await supabase
            .from('receipts')
            .insert({
              household_id: householdId,
              store_name: receiptData.storeName,
              receipt_date: receiptData.date,
              total_amount: receiptData.totalAmount,
              currency: receiptData.currency || 'USD',
              items: receiptData.items,
              image_url: receiptData.scannedImageUri,
              ocr_confidence: receiptData.ocrConfidence,
            })
            .select()
            .single();

          if (error) throw error;

          // Update with real ID from Supabase
          const syncedReceipt: Receipt = {
            ...newReceipt,
            id: data.id,
            syncStatus: 'synced',
            lastSyncedAt: new Date().toISOString(),
          };

          set({
            receipts: [syncedReceipt, ...receipts],
            lastSync: new Date(),
          });

          return syncedReceipt;
        } catch (error: any) {
          console.error('Error adding receipt:', error);
          newReceipt.syncStatus = 'error';
          set({
            receipts: [newReceipt, ...receipts],
            syncError: error.message,
          });
          return null;
        } finally {
          set({ isSyncing: false });
        }
      },

      // Update receipt
      updateReceipt: async (id, updates) => {
        const { householdId, receipts } = get();

        // Optimistic update
        set({
          receipts: receipts.map(receipt =>
            receipt.id === id
              ? {
                  ...receipt,
                  ...updates,
                  syncStatus: FEATURE_FLAGS.SAVE_RECEIPTS_TO_DB ? 'pending' : 'synced',
                }
              : receipt
          ),
        });

        if (!FEATURE_FLAGS.SAVE_RECEIPTS_TO_DB || !householdId) return;

        // Sync to Supabase
        set({ isSyncing: true });

        try {
          const { error } = await supabase
            .from('receipts')
            .update({
              store_name: updates.storeName,
              receipt_date: updates.date,
              total_amount: updates.totalAmount,
              items: updates.items,
            })
            .eq('id', id)
            .eq('household_id', householdId);

          if (error) throw error;

          // Mark as synced
          set({
            receipts: receipts.map(receipt =>
              receipt.id === id
                ? { ...receipt, ...updates, syncStatus: 'synced', lastSyncedAt: new Date().toISOString() }
                : receipt
            ),
            lastSync: new Date(),
          });
        } catch (error: any) {
          console.error('Error updating receipt:', error);
          set({
            receipts: receipts.map(receipt =>
              receipt.id === id ? { ...receipt, syncStatus: 'error' } : receipt
            ),
            syncError: error.message,
          });
        } finally {
          set({ isSyncing: false });
        }
      },

      // Delete receipt
      deleteReceipt: async (id) => {
        const { householdId, receipts } = get();

        // Optimistic delete
        set({ receipts: receipts.filter(receipt => receipt.id !== id) });

        if (!FEATURE_FLAGS.SAVE_RECEIPTS_TO_DB || !householdId) return;

        // Sync to Supabase
        set({ isSyncing: true });

        try {
          const { error } = await supabase
            .from('receipts')
            .delete()
            .eq('id', id)
            .eq('household_id', householdId);

          if (error) throw error;

          set({ lastSync: new Date() });
        } catch (error: any) {
          console.error('Error deleting receipt:', error);
          // Re-add receipt on error
          const deletedReceipt = receipts.find(receipt => receipt.id === id);
          if (deletedReceipt) {
            set({
              receipts: [...get().receipts, { ...deletedReceipt, syncStatus: 'error' }],
              syncError: error.message,
            });
          }
        } finally {
          set({ isSyncing: false });
        }
      },

      // Add items to fix queue
      addToFixQueue: async (items) => {
        const { householdId, fixQueueItems } = get();

        const newItems: FixQueueItem[] = items.map((item, index) => ({
          ...item,
          id: `temp-${Date.now()}-${index}`,
          createdAt: new Date().toISOString(),
          resolved: false,
          syncStatus: FEATURE_FLAGS.SAVE_RECEIPTS_TO_DB ? 'pending' : 'synced',
        }));

        // Update local state immediately
        set({ fixQueueItems: [...fixQueueItems, ...newItems] });

        if (!FEATURE_FLAGS.SAVE_RECEIPTS_TO_DB || !householdId) {
          // If sync is disabled, just use local IDs
          const localItems = newItems.map((item, index) => ({
            ...item,
            id: `${Date.now()}-${index}`,
            syncStatus: 'synced' as const,
          }));
          set({ fixQueueItems: [...fixQueueItems, ...localItems] });
          return;
        }

        // Sync to Supabase
        set({ isSyncing: true });

        try {
          const { data, error } = await supabase
            .from('fix_queue')
            .insert(
              newItems.map(item => ({
                household_id: householdId,
                receipt_id: item.receiptId,
                raw_text: item.rawText,
                parsed_name: item.parsedName,
                quantity: item.quantity,
                unit: item.unit,
                price: item.price,
                categories: item.category,
                confidence: item.confidence,
                resolved: false,
              }))
            )
            .select();

          if (error) throw error;

          // Update with real IDs from Supabase
          const syncedItems = data.map((dbItem, index) => ({
            ...newItems[index],
            id: dbItem.id,
            syncStatus: 'synced' as const,
            lastSyncedAt: new Date().toISOString(),
          }));

          set({
            fixQueueItems: [...fixQueueItems, ...syncedItems],
            lastSync: new Date(),
          });
        } catch (error: any) {
          console.error('Error adding to fix queue:', error);
          set({ syncError: error.message });
        } finally {
          set({ isSyncing: false });
        }
      },

      // Resolve fix queue item
      resolveFixQueueItem: async (id, itemData) => {
        const { householdId, fixQueueItems } = get();

        // Mark as resolved locally
        set({
          fixQueueItems: fixQueueItems.map(item =>
            item.id === id
              ? { ...item, resolved: true, linkedItemId: itemData.id }
              : item
          ),
        });

        if (!FEATURE_FLAGS.SAVE_RECEIPTS_TO_DB || !householdId) return;

        // Sync to Supabase
        try {
          const { error } = await supabase
            .from('fix_queue')
            .update({
              resolved: true,
              linked_item_id: itemData.id,
            })
            .eq('id', id)
            .eq('household_id', householdId);

          if (error) throw error;
        } catch (error: any) {
          console.error('Error resolving fix queue item:', error);
          // Revert on error
          set({
            fixQueueItems: fixQueueItems.map(item =>
              item.id === id
                ? { ...item, resolved: false, linkedItemId: undefined }
                : item
            ),
          });
        }
      },

      // Clear resolved items from fix queue
      clearFixQueue: async () => {
        const { householdId, fixQueueItems } = get();
        const resolvedItems = fixQueueItems.filter(item => item.resolved);

        // Remove resolved items locally
        set({ fixQueueItems: fixQueueItems.filter(item => !item.resolved) });

        if (!FEATURE_FLAGS.SAVE_RECEIPTS_TO_DB || !householdId) return;

        // Delete from Supabase
        try {
          for (const item of resolvedItems) {
            await supabase
              .from('fix_queue')
              .delete()
              .eq('id', item.id)
              .eq('household_id', householdId);
          }
        } catch (error: any) {
          console.error('Error clearing fix queue:', error);
        }
      },

      // Process OCR result
      processOCRResult: async (ocrData, imageUri) => {
        const { addReceipt, addToFixQueue } = get();

        // Extract receipt metadata
        const receiptData = {
          date: ocrData.date || new Date().toISOString().split('T')[0],
          storeName: ocrData.storeName || 'Unknown Store',
          totalAmount: ocrData.total || 0,
          currency: ocrData.currency || 'USD',
          items: ocrData.recognizedItems || [],
          scannedImageUri: imageUri,
          ocrConfidence: ocrData.confidence || 0,
        };

        // Save receipt
        const receipt = await addReceipt(receiptData);

        // Add uncertain items to fix queue
        if (ocrData.uncertainItems && ocrData.uncertainItems.length > 0) {
          const fixQueueItems = ocrData.uncertainItems.map((item: any) => ({
            receiptId: receipt?.id,
            rawText: item.rawText || item.text,
            parsedName: item.name || item.parsedName || 'Unknown Item',
            quantity: item.quantity || 1,
            unit: item.unit || 'pcs',
            price: item.price,
            category: item.category,
            confidence: item.confidence || 0.5,
          }));

          await addToFixQueue(fixQueueItems);
        }

        return receipt;
      },

      // Computed getters
      getReceiptById: (id) => {
        return get().receipts.find(receipt => receipt.id === id);
      },

      getReceiptsByDateRange: (startDate, endDate) => {
        return get().receipts.filter(receipt => {
          const receiptDate = new Date(receipt.date);
          return receiptDate >= startDate && receiptDate <= endDate;
        });
      },

      getTotalSpent: () => {
        return get().receipts.reduce((sum, receipt) => sum + receipt.totalAmount, 0);
      },

      getReceiptCount: () => {
        return get().receipts.length;
      },

      getRecentReceipts: (limit = 10) => {
        return get().receipts
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
          .slice(0, limit);
      },

      getPendingFixQueueItems: () => {
        return get().fixQueueItems.filter(item => !item.resolved);
      },
    }),
    {
      name: 'receipt-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        receipts: state.receipts.filter(r => r.syncStatus !== 'pending'),
        fixQueueItems: state.fixQueueItems.filter(i => i.syncStatus !== 'pending'),
        lastSync: state.lastSync,
      }),
    }
  )
);