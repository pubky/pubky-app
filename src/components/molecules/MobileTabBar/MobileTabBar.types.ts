import * as React from 'react';

export interface MobileTabBarItem {
  /** Stable key for React + optional data-testid derivation */
  key: string;
  /** Icon component; rendered at size 20 */
  icon: React.ComponentType<{ size?: number; className?: string }>;
  /** Already-translated/resolved label; also used as default aria-label */
  label: string;
  /** Whether this tab is currently selected */
  isActive: boolean;
  /** Called when the user activates this tab */
  onSelect: () => void;
  /** Optional override for aria-label (defaults to `label`) */
  ariaLabel?: string;
}

export type MobileTabBarPosition = 'sticky' | 'fixed';

export interface MobileTabBarProps {
  items: MobileTabBarItem[];
  /** When true, renders the label next to the icon. Defaults to false (icon-only). */
  showLabels?: boolean;
  /** Positioning strategy. Defaults to 'sticky'. */
  position?: MobileTabBarPosition;
  /** Extra classes merged onto the root (e.g. negative margin overrides). */
  className?: string;
  /** Optional data-testid for the root element. */
  'data-testid'?: string;
}
