import type { TMuteParams } from '@/controllers/mute/mute.types';
import type { HttpMethod } from '@/libs/http/http.types';

export type TMuteApplicationCommitParams = TMuteParams &
  (
    | { eventType: HttpMethod.PUT; muteUrl: string; muteBody: Uint8Array }
    | { eventType: HttpMethod.DELETE; deleteUrls: string[] }
  );
