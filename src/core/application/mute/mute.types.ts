import * as Core from '@/core';
import { HttpMethod } from '@/libs';

export type TMuteApplicationCommitParams = Core.TMuteParams & {
  eventType: HttpMethod;
  muteUrl: string;
  muteJson: Record<string, unknown>;
};
