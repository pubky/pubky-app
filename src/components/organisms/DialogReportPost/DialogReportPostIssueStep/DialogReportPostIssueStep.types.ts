import type { ReportIssueType } from '@/pipes/report/report.types';

export interface DialogReportPostIssueStepProps {
  /** Handler when an issue type is selected and Next is clicked */
  onSelectIssueType: (issueType: ReportIssueType) => void;
  /** Handler when Cancel is clicked */
  onCancel: () => void;
  /** Optional handler to close the dialog (needed for copyright redirect) */
  onOpenChange?: (open: boolean) => void;
}
