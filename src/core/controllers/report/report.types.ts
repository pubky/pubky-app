import type { Pubky } from '@/models/models.types';
export interface TReportSubmitParams {
  pubky: Pubky;
  postUrl: string;
  issueType: string;
  reason: string;
  name: string;
}
