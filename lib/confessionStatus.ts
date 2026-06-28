import { supabase } from './supabase';

export type ConfessionStatusValue = 'live' | 'approved' | 'under_review' | 'removed';

export interface ConfessionStatus {
  id:             string;
  status:         ConfessionStatusValue;
  removedReason?: string;
}

export async function getConfessionStatuses(ids: string[]): Promise<ConfessionStatus[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase.rpc('get_confession_statuses', { p_ids: ids });
  if (error || !Array.isArray(data)) return [];
  return (data as { id: string; status: string; removed_reason: string | null }[]).map(row => ({
    id:            row.id,
    status:        row.status as ConfessionStatusValue,
    removedReason: row.removed_reason ?? undefined,
  }));
}
