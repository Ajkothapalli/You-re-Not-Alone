import { supabase } from './supabase';

export interface AppNotification {
  id:            string;
  type:          'felt' | 'matched' | 'live' | 'removed';
  confession_id: string | null;
  data:          { felt_count?: number };
  read_at:       string | null;
  created_at:    string;
}

export async function getNotifications(): Promise<{
  notifications: AppNotification[];
  unreadCount:   number;
}> {
  const { data, error } = await supabase.functions.invoke<{
    notifications: AppNotification[];
    unreadCount:   number;
  }>('get-notifications');

  if (error || !data) return { notifications: [], unreadCount: 0 };
  return data;
}

export async function markNotificationsRead(ids?: string[]): Promise<void> {
  await supabase.functions.invoke('mark-notifications-read', {
    body: { ids: ids ?? [] },
  });
}
