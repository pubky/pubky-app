import { ReactNode } from 'react';
import { Control, FieldValues, Path } from 'react-hook-form';

export interface ControlledInputFieldProps<T extends FieldValues> {
  /** Field name that corresponds to a key in the form schema */
  name: Path<T>;
  /** React Hook Form control object */
  control: Control<T>;
  /** Optional label text displayed above the input */
  label?: string;
  /** Optional hint text displayed after the label */
  labelHint?: ReactNode;
  /** Placeholder text for the input */
  placeholder?: string;
  /** Maximum character length */
  maxLength?: number;
  /** Input border style variant */
  variant?: 'default' | 'dashed';
  /** Input size */
  size?: 'sm' | 'md' | 'lg';
  /** Optional icon to display */
  icon?: ReactNode;
  /** Icon position */
  iconPosition?: 'left' | 'right';
  /** Disabled state */
  disabled?: boolean;
  /** Loading state */
  loading?: boolean;
  /** Optional loading text */
  loadingText?: string;
  /** Optional paste handler */
  onPaste?: (event: React.ClipboardEvent<HTMLInputElement>) => void;
  /** Optional input wrapper class */
  className?: string;
  /** Optional class applied to the inner input element */
  inputClassName?: string;
  /** Cypress selector forwarded to the input */
  dataCy?: string;
}
