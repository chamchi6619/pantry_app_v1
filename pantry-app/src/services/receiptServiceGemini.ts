/**
 * Receipt OCR Service - Gemini 2.0 Flash JSON Mode
 * Routes all receipts to Python backend with Gemini JSON mode
 */

import { supabase } from '../lib/supabase';

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
  selectedLocation?: 'fridge' | 'freezer' | 'pantry';
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

class ReceiptServiceGemini {
  private backendUrl: string;

  constructor() {
    this.backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8000';
  }

  /**
   * Process receipt OCR text through Supabase Edge Function (Gemini 2.0 Flash)
   */
  async processReceipt(
    ocrText: string,
    householdId: string,
    options: {
      storeHint?: string;
      ocrConfidence?: number;
    } = {}
  ): Promise<ProcessReceiptResult> {
    try {
      console.log('🤖 Processing receipt with Gemini 2.0 Flash JSON mode');
      console.log('Household ID:', householdId);
      console.log('OCR text length:', ocrText.length);
      console.log('📝 OCR TEXT INPUT:');
      console.log('─────────────────────────────────────────────');
      console.log(ocrText);
      console.log('─────────────────────────────────────────────');

      // Call Supabase Edge Function with timeout
      console.log('⏱️ Calling Edge Function with 45s timeout...');

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 45000); // 45 second timeout

      let response;
      try {
        response = await supabase.functions.invoke('parse-receipt-gemini', {
          body: {
            ocr_text: ocrText,
            household_id: householdId
          },
          headers: {
            'x-timeout': '40000' // Tell Edge Function to timeout at 40s
          }
        });
        clearTimeout(timeoutId);
      } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
          console.error('⏱️ Edge Function timeout after 45 seconds');
          throw new Error('Request timed out. Please try again with a shorter receipt.');
        }
        throw error;
      }

      if (response.error) {
        console.error('Edge Function error:', response.error);
        throw response.error;
      }

      const data = response.data;

      if (!data?.success) {
        throw new Error(data?.error || 'Processing failed');
      }

      console.log('✅ Receipt parsed successfully');
      console.log(`   Items: ${data.items?.length || 0}`);
      console.log(`   Confidence: ${(data.confidence * 100).toFixed(0)}%`);
      if (data.gemini_cost) {
        console.log(`   Cost: $${data.gemini_cost.toFixed(6)}`);
      }

      // Log parsed items for debugging
      console.log('📦 PARSED ITEMS:');
      console.log('─────────────────────────────────────────────');
      data.items?.forEach((item: any, index: number) => {
        console.log(`${index + 1}. ${item.parsed_name}`);
        console.log(`   Raw: "${item.raw_text}"`);
        console.log(`   Qty: ${item.quantity} ${item.unit}`);
        console.log(`   Price: $${(item.price_cents / 100).toFixed(2)}`);
        console.log(`   Category: ${item.categories || 'none'}`);
        console.log(`   Confidence: ${(item.confidence * 100).toFixed(0)}%`);
      });
      console.log('─────────────────────────────────────────────');

      return {
        success: true,
        receipt: data.receipt,
        items: data.items || [],
        confidence: data.confidence || 0.85,
        path_taken: data.method || 'gemini',
        processing_time_ms: data.processing_time_ms,
        gemini_cost: data.gemini_cost
      };
    } catch (error) {
      console.error('Receipt processing error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Processing failed'
      };
    }
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
    return data;
  }

  /**
   * Confirm all fix queue items and move to purchase history
   */
  async confirmFixQueueItems(items: ReceiptItem[], householdId: string) {
    const purchases = items.map(item => ({
      household_id: householdId,
      product_name: item.parsed_name,
      quantity: item.quantity,
      unit: item.unit,
      unit_price_cents: item.price_cents,
      total_price_cents: Math.round(item.price_cents * item.quantity),
      category: item.categories,
      purchase_date: new Date().toISOString(),
      purchase_date_local: new Date().toISOString().split('T')[0]
    }));

    const { error: purchaseError } = await supabase
      .from('purchase_history')
      .insert(purchases);

    if (purchaseError) throw purchaseError;

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

    await supabase.rpc('update_shopping_patterns', {
      p_household_id: householdId
    });
  }
}

export const receiptService = new ReceiptServiceGemini();
