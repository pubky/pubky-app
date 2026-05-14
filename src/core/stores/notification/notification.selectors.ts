import { ZustandGet } from '../stores.types';
import { NotificationStore } from './notification.types';

// Selectors - State access functions with validation
export const createNotificationSelectors = (get: ZustandGet<NotificationStore>) => ({
  selectLastRead: () => {
    return get().lastRead;
  },

  selectLastPolledTimestamp: () => {
    return get().lastPolledTimestamp;
  },

  selectUnread: () => {
    return get().unread;
  },
});
