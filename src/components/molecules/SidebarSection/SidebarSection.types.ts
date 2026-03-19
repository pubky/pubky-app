import { LucideIcon } from 'lucide-react';

export interface SidebarSectionProps {
  /** Section title */
  title: string;
  /** Section content */
  children: React.ReactNode;
  /** Icon for header action button */
  headerActionIcon?: LucideIcon;
  /** Callback for header action button */
  onHeaderAction?: () => void;
  /** Label for header action button (accessibility) */
  headerActionLabel?: string;
  /** Icon for footer button */
  footerIcon?: LucideIcon;
  /** Footer button text */
  footerText?: string;
  /** Callback for footer button */
  onFooterClick?: () => void;
  /** Test ID for footer button */
  footerTestId?: string;
  /** data-cy for footer button (Cypress E2E) */
  footerDataCy?: string;
  /** Custom className */
  className?: string;
  /** For Cypress E2E tests */
  dataCy?: string;
  /** Test ID */
  'data-testid'?: string;
}
