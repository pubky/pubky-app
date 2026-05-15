import type { Pubky } from '@/models/models.types';

export type TMuteParams = {
  muter: Pubky;
  mutee: Pubky;
};

export type TMuteDirectoryEvent = {
  cursor: string;
  eventType: string;
};
