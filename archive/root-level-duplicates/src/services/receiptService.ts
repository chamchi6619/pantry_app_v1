/**
 * Receipt OCR Service
 * Handles receipt processing through Supabase Edge Function
 */

import { supabase } from '../lib/supabase';
import * as Crypto from 'expo-crypto';

export interface ReceiptItem {
  id?: string;
  raw_text: string;
  parsed_name: string;
  quantity: number;
  unit: string;
  price_cents: number;
  categories?: string;
  confidence: number;
  needs_review?: boolean;
}

export interface Receipt {
  id: string;
  store_name: string;
  store_id?: string;
  receipt_date: string;
  total_amount_cents: number;
  tax_amount_cents: number;
  subtotal_cents: number;
  status: string;
  path_taken?: string;
  processing_time_ms?: number;
}

export interface ProcessReceiptResult {
  success: boolean;
  receipt?: Receipt;
  items?: ReceiptItem[];
  store?: any;
  path_taken?: string;
  processing_time_ms?: number;
  gemini_cost?: number;
  confidence?: number;
  error?: string;
}

class ReceiptService {
  /**
   * Process receipt OCR text through Edge Function
   */
  async processReceipt(
    ocrText: string,
    householdId: string,
    options: {
      useGemini?: boolean;
      storeHint?: string;
      ocrConfidence?: number;
    } = {}
  ): Promise<ProcessReceiptResult> {
    try {
      console.log('Processing receipt with household ID:', householdId);
      console.log('OCR text length:', ocrText.length);
      console.log('Options:', options);

      // Call Edge Function (it calculates hash internally)
      const response = await supabase.functions.invoke('parse-receipt', {
        body: {
          ocr_text: ocrText,
          household_id: householdId,
          ocr_confidence: options.ocrConfidence || 0.85,
          use_gemini: options.useGemini || false,
          store_hint: options.storeHint
        }
      });

      console.log('Edge Function raw response:', response);

      if (response.error) {
        console.error('Edge Function error:', response.error);
        // Try to get more details from the error
        if (response.error instanceof Error && 'context' in response.error) {
          const context = (response.error as any).context;
          console.error('Error context:', context);

          // Try to read the response body for error details
          if (context && context._bodyInit) {
            try {
              const errorBody = await context.text();
              console.error('Error body:', errorBody);
              const errorJson = JSON.parse(errorBody);
              console.error('Parsed error:', errorJson);
              throw new Error(errorJson?.error?.message || 'Edge Function failed');
            } catch (e) {
              console.error('Could not parse error body:', e);
            }
          }
        }
        throw response.error;
      }

      const data = response.data;
      console.log('Edge Function response type:', typeof data);
      console.log('Edge Function data:', JSON.stringify(data, null, 2));

      // Check if data is undefined or null
      if (!data) {
        console.error('Edge Function returned no data');
        throw new Error('Edge Function returned no data');
      }

      // Edge Function returns {success, data, ...}
      if (!data?.success) {
        console.error('Edge Function failed:', data?.error);
        throw new Error(data?.error?.message || 'Processing failed');
      }

      console.log('=== RECEIPT PROCESSING SUCCESS ===');

      // Handle both response formats (v11 and v12)
      const responseData = data.data || data;

      console.log('Parse method:', responseData.method);
      console.log('Confidence:', responseData.confidence);
      console.log('Items parsed:', responseData.items?.length || 0);
      console.log('Raw items data:', JSON.stringify(responseData.items, null, 2));

      if (responseData.method === 'gemini') {
        console.log('🤖 GEMINI AI was used for parsing (low confidence heuristics)');
      } else {
        console.log('📝 Heuristics only - confidence was sufficient');
      }

      // Transform response to expected format
      const result = {
        success: true,
        receipt: {
          ...responseData.receipt,
          parse_method: responseData.method  // Add parse_method to receipt
        },
        items: responseData.items || [],
        confidence: responseData.confidence,
        path_taken: responseData.method,
        processing_time_ms: data.duration_ms || responseData.duration_ms
      };

      console.log('=== RETURNING TO SCANNER ===');
      console.log('Result items count:', result.items.length);
      console.log('Result receipt:', result.receipt);

      return result;
    } catch (error) {
      console.error('Receipt processing error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Processing failed'
      };
    }
  }

  /**
   * Calculate SHA256 hash of text for idempotency
   */
  private async calculateContentHash(text: string): Promise<string> {
    const hash = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      text,
      { encoding: Crypto.CryptoEncoding.HEX }
    );
    return hash.substring(0, 16);
  }

  /**
   * Get fix queue items for household
   */
  async getFixQueueItems(householdId: string) {
    const { data, error } = await supabase
      .from('receipt_fix_queue')
      .select(`
        *,
        receipt:receipts(store_name, receipt_date)
      `)
      .eq('household_id', householdId)
      .eq('resolved', false)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  /**
   * Update fix queue item with user corrections
   */
  async updateFixQueueItem(
    itemId: string,
    updates: {
      parsed_name?: string;
      quantity?: number;
      unit?: string;
      price_cents?: number;
      categories?: string;
      linked_item_id?: string;
    }
  ) {
    const { data, error } = await supabase
      .from('receipt_fix_queue')
      .update({
        ...updates,
        resolved: true,
        resolution_type: 'user_edited',
        updated_at: new Date().toISOString()
      })
      .eq('id', itemId)
      .select()
      .single();

    if (error) throw error;

    // Learn from correction if name changed
    if (updates.parsed_name && data.parsed_name !== updates.parsed_name) {
      await this.saveCorrection(
        data.raw_text,
        updates.parsed_name,
        'product_name'
      );
    }

    return data;
  }

  /**
   * Save OCR correction for learning
   */
  private async saveCorrection(
    pattern: string,
    correction: string,
    context: string
  ) {
    try {
      await supabase
        .from('ocr_corrections')
        .upsert(
          {
            pattern,
            correction,
            context,
            frequency: 1,
            confidence: 0.8
          },
          {
            onConflict: 'pattern,correction,context',
            ignoreDuplicates: false
          }
        );
    } catch (error) {
      console.error('Failed to save correction:', error);
    }
  }

  /**
   * Confirm all fix queue items and move to purchase history
   */
  async confirmFixQueueItems(items: ReceiptItem[], householdId: string) {
    // Prepare purchase history entries
    const purchases = items.map(item => ({
      household_id: householdId,
      product_name: item.parsed_name,
      quantity: item.quantity,
      unit: item.unit,
      unit_price_cents: item.price_cents,
      total_price_cents: item.price_cents * item.quantity,
      category: item.categories,
      purchase_date: new Date().toISOString(),
      purchase_date_local: new Date().toISOString().split('T')[0]
    }));

    // Insert to purchase history
    const { error: purchaseError } = await supabase
      .from('purchase_history')
      .insert(purchases);

    if (purchaseError) throw purchaseError;

    // Mark items as resolved
    const itemIds = items.map(i => i.id).filter(Boolean);
    if (itemIds.length > 0) {
      const { error: resolveError } = await supabase
        .from('receipt_fix_queue')
        .update({
          resolved: true,
          resolution_type: 'user_confirmed',
          updated_at: new Date().toISOString()
        })
        .in('id', itemIds);

      if (resolveError) throw resolveError;
    }

    // Trigger pattern update
    await supabase.rpc('update_shopping_patterns', {
      p_household_id: householdId
    });
  }

  /**
   * Get receipt history for household
   */
  async getReceiptHistory(householdId: string, limit = 20) {
    const { data, error } = await supabase
      .from('receipts_view')
      .select(`
        *,
        store:stores(name, city, state),
        items:receipt_items(count)
      `)
      .eq('household_id', householdId)
      .order('receipt_date', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data;
  }

  /**
   * Get purchase history with analytics
   */
  async getPurchaseHistory(householdId: string, options: {
    limit?: number;
    productName?: string;
    storeId?: string;
    startDate?: string;
    endDate?: string;
  } = {}) {
    let query = supabase
      .from('purchase_history_view')
      .select('*')
      .eq('household_id', householdId);

    if (options.productName) {
      query = query.ilike('product_name', `%${options.productName}%`);
    }
    if (options.storeId) {
      query = query.eq('store_id', options.storeId);
    }
    if (options.startDate) {
      query = query.gte('purchase_date', options.startDate);
    }
    if (options.endDate) {
      query = query.lte('purchase_date', options.endDate);
    }

    query = query
      .order('purchase_date', { ascending: false })
      .limit(options.limit || 50);

    const { data, error } = await query;
    if (error) throw error;
    return data;
  }

  /**
   * Get shopping suggestions based on patterns
   */
  async getShoppingSuggestions(householdId: string) {
    const { data, error } = await supabase.rpc('suggest_shopping_items', {
      p_household_id: householdId
    });

    if (error) throw error;
    return data;
  }

  /**
   * Get weekly spending summary
   */
  async getWeeklySpending(householdId: string, weeksBack = 12) {
    const { data, error } = await supabase.rpc('get_weekly_spending', {
      p_household_id: householdId,
      p_weeks_back: weeksBack
    });

    if (error) throw error;
    return data;
  }

  /**
   * Get store price comparison
   */
  async getStorePriceComparison(householdId: string, itemName?: string) {
    const { data, error } = await supabase.rpc('get_store_comparison', {
      p_household_id: householdId,
      p_item_name: itemName
    });

    if (error) throw error;
    return data;
  }

  /**
   * Check user's API rate limits
   */
  async checkRateLimits(userId: string) {
    const { data, error } = await supabase
      .from('api_rate_limits')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') throw error; // Ignore not found

    const now = new Date();
    const lastReset = data ? new Date(data.last_reset) : now;
    const hoursSinceReset = (now.getTime() - lastReset.getTime()) / (1000 * 60 * 60);

    if (hoursSinceReset >= 24 || !data) {
      return {
        daily_ocr_remaining: 100,
        daily_gemini_remaining: 50,
        will_reset_at: new Date(now.getTime() + 24 * 60 * 60 * 1000)
      };
    }

    return {
      daily_ocr_remaining: Math.max(0, 100 - (data.daily_ocr_count || 0)),
      daily_gemini_remaining: Math.max(0, 50 - (data.daily_gemini_count || 0)),
      will_reset_at: new Date(lastReset.getTime() + 24 * 60 * 60 * 1000)
    };
  }
}

export const receiptService = new ReceiptService();