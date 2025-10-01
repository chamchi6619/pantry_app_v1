import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { receiptService } from './receiptService';

export interface QueuedReceipt {
  id: string;
  ocrText: string;
  householdId: string;
  metadata: {
    captureDate: string;
    ocr_confidence?: number;
    store_hint?: string;
    receipt_date_hint?: string;
  };
  retryCount: number;
  lastAttempt?: string;
  error?: string;
}

const QUEUE_KEY = '@offline_ocr_queue';
const MAX_RETRIES = 3;
const RETRY_DELAY = 5000; // 5 seconds

class OfflineQueueService {
  private isProcessing = false;
  private listeners: Set<(queue: QueuedReceipt[]) => void> = new Set();

  constructor() {
    // Monitor network connectivity
    NetInfo.addEventListener(state => {
      if (state.isConnected) {
        this.processQueue();
      }
    });
  }

  async addToQueue(
    ocrText: string,
    householdId: string,
    metadata: QueuedReceipt['metadata']
  ): Promise<void> {
    const queued: QueuedReceipt = {
      id: `ocr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ocrText,
      householdId,
      metadata,
      retryCount: 0,
    };

    const queue = await this.getQueue();
    queue.push(queued);
    await this.saveQueue(queue);
    this.notifyListeners(queue);

    // Try processing immediately if online
    const netState = await NetInfo.fetch();
    if (netState.isConnected) {
      this.processQueue();
    }
  }

  async getQueue(): Promise<QueuedReceipt[]> {
    try {
      const json = await AsyncStorage.getItem(QUEUE_KEY);
      return json ? JSON.parse(json) : [];
    } catch (error) {
      console.error('Failed to get offline queue:', error);
      return [];
    }
  }

  private async saveQueue(queue: QueuedReceipt[]): Promise<void> {
    try {
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    } catch (error) {
      console.error('Failed to save offline queue:', error);
    }
  }

  async processQueue(): Promise<void> {
    if (this.isProcessing) return;

    const netState = await NetInfo.fetch();
    if (!netState.isConnected) return;

    this.isProcessing = true;

    try {
      const queue = await this.getQueue();
      const remainingQueue: QueuedReceipt[] = [];

      for (const receipt of queue) {
        try {
          // Attempt to process the receipt
          const result = await receiptService.processReceipt(
            receipt.ocrText,
            receipt.householdId,
            {
              ocr_confidence: receipt.metadata.ocr_confidence,
              store_hint: receipt.metadata.store_hint,
              receipt_date_hint: receipt.metadata.receipt_date_hint,
            }
          );

          if (result.success) {
            console.log(`Successfully processed queued receipt ${receipt.id}`);
            // Receipt processed successfully, don't add back to queue
          } else {
            throw new Error(result.error?.message || 'Processing failed');
          }
        } catch (error: any) {
          receipt.retryCount++;
          receipt.lastAttempt = new Date().toISOString();
          receipt.error = error.message;

          if (receipt.retryCount < MAX_RETRIES) {
            // Add back to queue for retry
            remainingQueue.push(receipt);
            console.log(`Receipt ${receipt.id} will be retried (attempt ${receipt.retryCount}/${MAX_RETRIES})`);
          } else {
            console.error(`Receipt ${receipt.id} failed after ${MAX_RETRIES} attempts`);
            // Could store permanently failed items separately for manual review
          }
        }

        // Delay between processing items to avoid overwhelming the server
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Save the updated queue
      await this.saveQueue(remainingQueue);
      this.notifyListeners(remainingQueue);

      // If there are items remaining, schedule another processing attempt
      if (remainingQueue.length > 0) {
        setTimeout(() => this.processQueue(), RETRY_DELAY);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  async removeFromQueue(id: string): Promise<void> {
    const queue = await this.getQueue();
    const filtered = queue.filter(item => item.id !== id);
    await this.saveQueue(filtered);
    this.notifyListeners(filtered);
  }

  async clearQueue(): Promise<void> {
    await this.saveQueue([]);
    this.notifyListeners([]);
  }

  // Subscribe to queue changes
  subscribe(listener: (queue: QueuedReceipt[]) => void): () => void {
    this.listeners.add(listener);

    // Send current queue state
    this.getQueue().then(queue => listener(queue));

    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(queue: QueuedReceipt[]): void {
    this.listeners.forEach(listener => listener(queue));
  }

  async getQueueStatus(): Promise<{
    pending: number;
    failed: number;
    isOnline: boolean;
    isProcessing: boolean;
  }> {
    const queue = await this.getQueue();
    const netState = await NetInfo.fetch();

    return {
      pending: queue.filter(r => r.retryCount < MAX_RETRIES).length,
      failed: queue.filter(r => r.retryCount >= MAX_RETRIES).length,
      isOnline: netState.isConnected || false,
      isProcessing: this.isProcessing,
    };
  }
}

export const offlineQueueService = new OfflineQueueService();