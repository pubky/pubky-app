import type { Pubky } from '@/models/models.types';

export type TBootstrapParams = {
  pubky: Pubky;
  isCurrent?: () => boolean;
  lastReadUrl: string;
};
