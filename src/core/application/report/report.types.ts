import type { Pubky } from '@/models/models.types';
import type { ReportIssueType } from '@/pipes/report/report.types';
export interface TReportSubmitInput {
  pubky: Pubky;
  postUrl: string;
  issueType: ReportIssueType;
  reason: string;
  name: string;
}
