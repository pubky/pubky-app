import type { ButtonHTMLAttributes, MouseEvent } from 'react';

export interface PostTagProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'color'> {
  /** Tag label text */
  label: string;
  /** Number of posts with this tag (optional) */
  count?: number;
  /** A wider count, shown muted after `count` ("5 (10)": people across an external resource's services) */
  total?: number;
  /** `secondary`: a faint tint of the tag colour and a dashed edge (`SECONDARY_TAG_STYLE`), for a tag not here yet */
  variant?: 'default' | 'secondary';
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
