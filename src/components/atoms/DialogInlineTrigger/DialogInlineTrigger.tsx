import { cn } from '@/libs/utils/utils';
import { Typography } from '../Typography/Typography';

type DialogInlineTriggerProps = Omit<React.HTMLAttributes<HTMLSpanElement>, 'role' | 'tabIndex'> & {
  children: React.ReactNode;
};

/**
 * Inline text that opens a dialog from inside a paragraph.
 *
 * Renders a span with button semantics (role, tab stop, Enter and Space activation) rather than a native
 * button: a button is inline-block, so it cannot break across lines and reflows the surrounding paragraph.
 * Use it as the child of `<DialogTrigger asChild>`, which merges the Radix trigger props into the span.
 */
export function DialogInlineTrigger({ children, className, onKeyDown, ...props }: DialogInlineTriggerProps) {
  const handleKeyDown = (event: React.KeyboardEvent<HTMLSpanElement>) => {
    onKeyDown?.(event);
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      event.currentTarget.click();
    }
  };

  return (
    <Typography
      as="span"
      size="sm"
      {...props}
      role="button"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className={cn('cursor-pointer font-medium text-brand', className)}
    >
      {children}
    </Typography>
  );
}
