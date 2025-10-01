import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface ReceiptItem {
  name: string;
  quantity: number;
  unit: string;
  price?: number;
}

export interface Receipt {
  id: string;
  date: string;
  storeName: string;
  totalAmount: number;
  items: ReceiptItem[];
  createdAt: string;
  scannedImageUri?: string;
}

interface ReceiptState {
  receipts: Receipt[];

  // Actions
  addReceipt: (receipt: Omit<Receipt, 'id' | 'createdAt'>) => void;
  updateReceipt: (id: string, updates: Partial<Receipt>) => void;
  deleteReceipt: (id: string) => void;

  // Computed
  getReceiptById: (id: string) => Receipt | undefined;
  getReceiptsByDateRange: (startDate: Date, endDate: Date) => Receipt[];
  getTotalSpent: () => number;
  getReceiptCount: () => number;
  getRecentReceipts: (limit?: number) => Receipt[];
}

export const useReceiptStore = create<ReceiptState>()(
  persist(
    (set, get) => ({
      receipts: [],

      addReceipt: (receiptData) => {
        const newReceipt: Receipt = {
          ...receiptData,
          id: Date.now().toString(),
          createdAt: new Date().toISOString(),
        };

        set((state) => ({
          receipts: [newReceipt, ...state.receipts], // Add new receipt at the beginning
        }));
      },

      updateReceipt: (id, updates) => {
        set((state) => ({
          receipts: state.receipts.map((receipt) =>
            receipt.id === id
              ? { ...receipt, ...updates }
              : receipt
          ),
        }));
      },

      deleteReceipt: (id) => {
        set((state) => ({
          receipts: state.receipts.filter((receipt) => receipt.id !== id),
        }));
      },

      getReceiptById: (id) => {
        return get().receipts.find((receipt) => receipt.id === id);
      },

      getReceiptsByDateRange: (startDate, endDate) => {
        return get().receipts.filter((receipt) => {
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
    }),
    {
      name: 'pantry-receipt-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);