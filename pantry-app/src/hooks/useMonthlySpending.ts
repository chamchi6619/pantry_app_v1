import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface MonthlySpendingData {
  total_cents: number;
  trip_count: number;
  item_count: number;
  trend_pct: number;
  daily_totals: number[];
}

interface UseMonthlySpendingReturn {
  data: MonthlySpendingData | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useMonthlySpending(): UseMonthlySpendingReturn {
  const { householdId } = useAuth();
  const [data, setData] = useState<MonthlySpendingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchSpending = async () => {
    if (!householdId) {
      setData(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data: result, error: rpcError } = await supabase.rpc(
        'get_monthly_spending_summary',
        {
          p_household_id: householdId,
          p_month: new Date().toISOString().split('T')[0], // YYYY-MM-DD
        }
      );

      if (rpcError) throw rpcError;

      // RPC returns array with single row
      if (result && result.length > 0) {
        setData(result[0]);
      } else {
        setData({
          total_cents: 0,
          trip_count: 0,
          item_count: 0,
          trend_pct: 0,
          daily_totals: [],
        });
      }
    } catch (err) {
      console.error('[useMonthlySpending] Error fetching spending data:', err);
      setError(err as Error);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSpending();
  }, [householdId]);

  return {
    data,
    loading,
    error,
    refetch: fetchSpending,
  };
}
