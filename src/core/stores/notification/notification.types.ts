export interface NotificationState {
  lastRead: number;
  lastPolledTimestamp: number | undefined;
  unread: number;
}

export interface NotificationActions {
  setState: (state: NotificationState) => void;
  setLastRead: (lastRead: number) => void;
  setLastPolledTimestamp: (lastPolledTimestamp: number | undefined) => void;
  setUnread: (unread: number) => void;
  reset: () => void;
}

export interface NotificationSelectors {
  selectLastRead: () => number;
  selectLastPolledTimestamp: () => number | undefined;
  selectUnread: () => number;
}

export type NotificationStore = NotificationState & NotificationActions & NotificationSelectors;

export const notificationInitialState: NotificationState = {
  lastRead: 0,
  lastPolledTimestamp: undefined,
  unread: 0,
};

export enum NotificationActionTypes {
  INIT = 'INIT',
  SET_LAST_READ = 'SET_LAST_READ',
  SET_LAST_POLLED_TIMESTAMP = 'SET_LAST_POLLED_TIMESTAMP',
  SET_UNREAD = 'SET_UNREAD',
  MARK_ALL_AS_READ = 'MARK_ALL_AS_READ',
  RESET = 'RESET',
}
