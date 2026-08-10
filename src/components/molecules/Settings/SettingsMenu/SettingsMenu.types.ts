export interface SettingsMenuItem {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  /** Stable identifier used for React keys and data-cy hooks. */
  id: string;
  label: string;
  path: string;
}
