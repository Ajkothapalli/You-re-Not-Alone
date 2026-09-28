import React, { useMemo, createContext, useContext, useState } from 'react';

interface NotificationsContextValue {
  unreadCount:    number;
  setUnreadCount: (n: number) => void;
}

const NotificationsContext = createContext<NotificationsContextValue>({
  unreadCount:    0,
  setUnreadCount: () => {},
});

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const [unreadCount, setUnreadCount] = useState(0);

  /**
   * Memoized for the same reason as the theme value: an inline object gets a
   * new identity every render, and a changed context value re-renders every
   * consumer unconditionally — React.memo cannot stop it, because context is
   * not a prop.
   */
  const notificationsValue = useMemo(
    () => ({ unreadCount, setUnreadCount }), [unreadCount]);

  return (
    <NotificationsContext.Provider value={notificationsValue}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotificationsContext() {
  return useContext(NotificationsContext);
}
