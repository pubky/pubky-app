import type { TMuteParams } from '@/controllers/mute/mute.types';
import type { HttpMethod } from '@/libs/http/http.types';

export type TMuteApplicationCommitParams = TMuteParams &
  (
    | { eventType: HttpMethod.PUT; muteUrl: string; muteBody: Uint8Array }
    /** Every copy of the mute to delete: the 0.x one first, then the v1 one. */
    | { eventType: HttpMethod.DELETE; deleteUrls: string[] }
  );
