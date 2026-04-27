import * as Core from '@/core';
import { HttpMethod } from '@/libs/http/http.types';

export type TMuteApplicationCommitParams = Core.TMuteParams & {
  eventType: HttpMethod;
  muteUrl: string;
  muteJson: Record<string, unknown>;
};
