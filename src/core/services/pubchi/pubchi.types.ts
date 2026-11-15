import type { RequestObjectV2 } from '@/libs/pubchi/schemas/request';

export type PubchiQueryBody = {
  question: string;
};

export type PubchiQueryRequest = {
  request: RequestObjectV2;
  body: PubchiQueryBody;
};
