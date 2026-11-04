import type { Pubky } from '@/models/models.types';

export type TFileBody = {
  uris: Pubky[];
};

export enum FileVariant {
  SMALL = 'small',
  FEED = 'feed',
  /** 1440 px WebP, never upscaled. Images only; videos have `main` alone. */
  LARGE = 'large',
  MAIN = 'main',
}

export type TFileParams = {
  pubky: Pubky;
  /** A v1 file's whole `{hash}.{ext}` filename, or a 0.x file's id. */
  file_id: string;
  variant: FileVariant;
};
