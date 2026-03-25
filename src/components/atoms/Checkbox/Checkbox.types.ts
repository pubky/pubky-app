import { Checkbox as CheckboxPrimitive } from 'radix-ui';

export interface CheckboxProps extends React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root> {
  /** Optional label text displayed next to the checkbox */
  label?: string;
  /** Optional description text displayed below the label */
  description?: string;
}
