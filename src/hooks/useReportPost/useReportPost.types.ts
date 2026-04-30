import { REPORT_POST_STEPS } from './useReportPost.constants';
import type { ReportIssueType } from '@/pipes/report/report.types';
export type ReportPostStep = (typeof REPORT_POST_STEPS)[keyof typeof REPORT_POST_STEPS];

/**
 * Return type of useReportPost hook
 */
export interface UseReportPostReturn {
  /** Current step in the report flow */
  step: ReportPostStep;
  /** Selected issue type, null if not selected */
  selectedIssueType: ReportIssueType | null;
  /** Reason text entered by user */
  reason: string;
  /** True while submission is in progress */
  isSubmitting: boolean;
  /** True after successful submission */
  isSuccess: boolean;
  /** True if reason has non-whitespace content */
  hasContent: boolean;
  /** Select an issue type and advance to reason step */
  selectIssueType: (issueType: ReportIssueType) => void;
  /** Handler for reason textarea onChange */
  handleReasonChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  /** Submit the report */
  submit: () => Promise<void>;
  /** Reset all state to initial values */
  reset: () => void;
}
