export interface PostTagAddButtonProps {
  /** Callback when button is clicked */
  onClick?: () => void;
  /** Additional className */
  className?: string;
  /** Whether the button is disabled */
  disabled?: boolean;
  /** Visual style variant for the button chrome. */
  variant?: 'dashed' | 'plain';
}
