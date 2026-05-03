import { HttpMethod } from '@/libs/http/http.types';
import type { TMuteParams } from '@/controllers/mute/mute.types';
export type TMuteApplicationCommitParams = TMuteParams & {
  eventType: HttpMethod;
  muteUrl: string;
  muteJson: Record<string, unknown>;
};
