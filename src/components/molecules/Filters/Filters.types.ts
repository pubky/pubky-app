/**
 * Shared types for all Filter components
 */

import type * as React from 'react';

/**
 * Base item structure for filter radiogroups
 */
export interface FilterListItem<T = string> {
  key: T;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
  dataCy?: string;
}

/**
 * Base props for filter components
 */
export interface BaseFilterProps<T = string> {
  /**
   * Controlled selected value
   */
  selectedTab?: T;
  /**
   * Default value for uncontrolled mode
   */
  defaultSelectedTab?: T;
  /**
   * Callback when selection changes
   */
  onTabChange?: (tab: T) => void;
  /**
   * Whether the filter is disabled
   */
  disabled?: boolean;
}

/**
 * Extended filter props with onClose support
 */
export interface FilterPropsWithClose<T = string> extends BaseFilterProps<T> {
  /**
   * Callback to close filter dialog/drawer
   */
  onClose?: () => void;
}
