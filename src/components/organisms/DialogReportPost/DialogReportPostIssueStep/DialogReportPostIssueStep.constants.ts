/**
 * Icons for each issue type
 */
import {
  Copyright,
  Flame,
  Frown,
  Hand,
  Megaphone,
  PersonStanding,
  ShieldAlert,
  ShoppingBasket,
  SquareUserRound,
} from 'lucide-react';
import { REPORT_ISSUE_TYPES } from '@/pipes/report/report.constants';
import type { ReportIssueType } from '@/pipes/report/report.types';

export const ISSUE_TYPE_ICONS: Record<
  ReportIssueType,
  React.ComponentType<{
    className?: string;
  }>
> = {
  [REPORT_ISSUE_TYPES.PERSONAL_INFO]: SquareUserRound,
  [REPORT_ISSUE_TYPES.HATE_SPEECH]: Frown,
  [REPORT_ISSUE_TYPES.HARASSMENT]: Hand,
  [REPORT_ISSUE_TYPES.CHILD_ABUSE]: PersonStanding,
  [REPORT_ISSUE_TYPES.TERRORISM]: Megaphone,
  [REPORT_ISSUE_TYPES.VIOLENCE]: ShieldAlert,
  [REPORT_ISSUE_TYPES.ILLEGAL_SALES]: ShoppingBasket,
  [REPORT_ISSUE_TYPES.SEXUAL_CONTENT]: Flame,
  [REPORT_ISSUE_TYPES.COPYRIGHT]: Copyright,
};
