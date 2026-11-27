export interface LocksAccessRow {
  id: 'lock-server' | 'bitkit';
  label: string;
  action: string;
  dialogTitle: string;
  dialogText: string;
}

export interface LocksEnabledCardProps {
  /** Called when the creator confirms a dialog, to check the setup again. */
  onRecheck: () => void;
}
