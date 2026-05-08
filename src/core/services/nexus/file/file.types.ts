import type { Pubky } from '@/models/models.types';

export type TFileBody = {
  uris: Pubky[];
};

export enum FileVariant {
  SMALL = 'small',
  FEED = 'feed',
  MAIN = 'main',
}

export type TFileParams = {
  pubky: Pubky;
  file_id: string;
  variant: FileVariant;
};
