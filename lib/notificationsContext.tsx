import React, { createContext, useContext, useState } from 'react';

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
  return (
    <NotificationsContext.Provider value={{ unreadCount, setUnreadCount }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotificationsContext() {
  return useContext(NotificationsContext);
}
