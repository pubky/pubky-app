import type { Popover as PopoverPrimitive } from 'radix-ui';

export interface PopoverContextType {
  hover?: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export interface PopoverProps extends React.ComponentProps<typeof PopoverPrimitive.Root> {
  /** Enable hover behavior to open/close popover on mouse enter/leave */
  hover?: boolean;
  /** Delay in milliseconds before opening the popover on hover */
  hoverDelay?: number;
  /** Delay in milliseconds before closing the popover on mouse leave */
  hoverCloseDelay?: number;
}
