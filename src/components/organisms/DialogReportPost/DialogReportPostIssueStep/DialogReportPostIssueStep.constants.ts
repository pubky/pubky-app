/**
 * Icons for each issue type
 */
import { IdCard, Frown, Hand, Baby, Flag, ShieldAlert, Briefcase, Ban, Copyright } from 'lucide-react';
import { REPORT_ISSUE_TYPES } from '@/pipes/report/report.constants';
import type { ReportIssueType } from '@/pipes/report/report.types';
export const ISSUE_TYPE_ICONS: Record<
  ReportIssueType,
  React.ComponentType<{
    className?: string;
  }>
> = {
  [REPORT_ISSUE_TYPES.PERSONAL_INFO]: IdCard,
  [REPORT_ISSUE_TYPES.HATE_SPEECH]: Frown,
  [REPORT_ISSUE_TYPES.HARASSMENT]: Hand,
  [REPORT_ISSUE_TYPES.CHILD_ABUSE]: Baby,
  [REPORT_ISSUE_TYPES.TERRORISM]: Flag,
  [REPORT_ISSUE_TYPES.VIOLENCE]: ShieldAlert,
  [REPORT_ISSUE_TYPES.ILLEGAL_SALES]: Briefcase,
  [REPORT_ISSUE_TYPES.SEXUAL_CONTENT]: Ban,
  [REPORT_ISSUE_TYPES.COPYRIGHT]: Copyright,
};
