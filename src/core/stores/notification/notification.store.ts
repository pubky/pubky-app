import { create } from 'zustand';
import { persist, devtools } from 'zustand/middleware';
import { NotificationStore, notificationInitialState } from './notification.types';
import { createNotificationActions } from './notification.actions';
import { createNotificationSelectors } from './notification.selectors';

// Store creation
export const useNotificationStore = create<NotificationStore>()(
  devtools(
    persist(
      (set, get) => ({
        ...notificationInitialState,
        ...createNotificationActions(set),
        ...createNotificationSelectors(get),
      }),
      {
        name: 'notification-store',
        // Only persist essential data
        partialize: (state) => ({
          lastRead: state.lastRead,
          lastPolledTimestamp: state.lastPolledTimestamp,
          unread: state.unread,
        }),
      },
    ),
    {
      name: 'notification-store',
      enabled: process.env.NODE_ENV === 'development',
    },
  ),
);
