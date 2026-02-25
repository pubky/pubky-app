export interface SettingsSwitchItemProps {
  /** Unique identifier for the switch, used for label association */
  id: string;
  /** Label text displayed next to the switch */
  label: string;
  /** Optional description text displayed below the label */
  description?: string;
  /** Whether the switch is checked */
  checked: boolean;
  /** Whether the switch is disabled */
  disabled?: boolean;
  /** Callback when the switch state changes */
  onChange?: (checked: boolean) => void;
}
