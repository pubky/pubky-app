import type { ButtonHTMLAttributes, MouseEvent } from 'react';

export interface PostTagProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'color'> {
  /** Tag label text */
  label: string;
  /** Number of posts with this tag (optional) */
  count?: number;
  /** Show the close/remove button */
  showClose?: boolean;
  /** Selected state */
  selected?: boolean;
  /** Callback when tag is clicked */
  onClick?: (e: MouseEvent) => void;
  /** Callback when close button is clicked */
  onClose?: (e: MouseEvent) => void;
  /** Custom color (hex) for the tag - if not provided, generates from label */
  color?: string;
}
