import { APP_LAST_READ_FILE, APP_PRIVATE_PATH } from '@/config/app-files';
import type { Pubky } from '@/models/models.types';

/** The notification read cursor as the app stores it, `{ timestamp }` in milliseconds, with its URL. */
export type TLastRead = {
  url: string;
  lastRead: { timestamp: number };
};

export class LastReadNormalizer {
  private constructor() {}

  /** The app-owned notification read cursor, in the app's private namespace. */
  static buildUrl(pubky: Pubky): string {
    return `pubky://${pubky}${APP_PRIVATE_PATH}${APP_LAST_READ_FILE}`;
  }

  /** Where a 0.x client kept the cursor; read while the v1 file is absent. */
  static buildLegacyUrl(pubky: Pubky): string {
    return `pubky://${pubky}/pub/pubky.app/last_read`;
  }

  /** A cursor at the current time, the document a mark-all-as-read or a first bootstrap writes. */
  static to(pubky: Pubky): TLastRead {
    return { url: this.buildUrl(pubky), lastRead: { timestamp: Date.now() } };
  }
}
