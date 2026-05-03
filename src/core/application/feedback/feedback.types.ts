import type { Pubky } from '@/models/models.types';

export interface TFeedbackSubmitInput {
  pubky: Pubky;
  comment: string;
  name: string;
}
