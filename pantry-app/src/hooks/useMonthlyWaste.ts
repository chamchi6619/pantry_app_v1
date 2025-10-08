import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface WasteCategory {
  category: string;
  count: number;
  quantity: number;
}

interface WasteLocation {
  location: string;
  count: number;
}

interface RecentWasteItem {
  item_name: string;
  category: string;
  quantity: number;
  unit: string;
  days_past_expiry: number;
  created_at: string;
}

interface MonthlyWasteData {
  total_items_wasted: number;
  total_quantity_wasted: number;
  most_wasted_category: string | null;
  avg_days_past_expiry: number;
  by_category: WasteCategory[];
  by_location: WasteLocation[];
  recent_items: RecentWasteItem[];
  trend_vs_last_month: number;
}

interface UseMonthlyWasteReturn {
  data: MonthlyWasteData | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useMonthlyWaste(): UseMonthlyWasteReturn {
  const { householdId } = useAuth();
  const [data, setData] = useState<MonthlyWasteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchWaste = async () => {
    if (!householdId) {
      setData(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data: result, error: rpcError } = await supabase.rpc(
        'get_monthly_waste_summary',
        {
          p_household_id: householdId,
          p_month: new Date().toISOString().split('T')[0],
        }
      );

      if (rpcError) throw rpcError;

      // RPC returns a single JSON object
      if (result) {
        setData(result as MonthlyWasteData);
      } else {
        setData({
          total_items_wasted: 0,
          total_quantity_wasted: 0,
          most_wasted_category: null,
          avg_days_past_expiry: 0,
          by_category: [],
          by_location: [],
          recent_items: [],
          trend_vs_last_month: 0,
        });
      }
    } catch (err) {
      console.error('[useMonthlyWaste] Error fetching waste data:', err);
      setError(err as Error);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWaste();
  }, [householdId]);

  return {
    data,
    loading,
    error,
    refetch: fetchWaste,
  };
}
