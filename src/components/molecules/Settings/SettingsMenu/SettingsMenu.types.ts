export interface SettingsMenuItem {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  labelKey: string;
  path: string;
}
