import { EyeOff } from 'lucide-react';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { cn } from '@/libs/utils/utils';

interface ModerationBlurOverlayProps {
  /** Message shown under the icon, e.g. "Collection content moderated." */
  label: string;
  className?: string;
}

/**
 * Centered "content moderated" overlay (eye-off icon + label) layered over a
 * blurred placeholder. Absolutely fills its positioned parent. Shared by the
 * blurred collection card / hero (and any other moderated-content placeholder)
 * so the unblur affordance stays visually consistent.
 *
 * Expects a `group` ancestor for the hover color transition, and a `relative`
 * (positioned) parent so the `inset-0` fill lands correctly.
 */
export function ModerationBlurOverlay({ label, className }: ModerationBlurOverlayProps) {
  return (
    <Container
      overrideDefaults
      className={cn(
        'absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground transition-colors group-hover:text-secondary-foreground',
        className,
      )}
    >
      <EyeOff className="size-6" />
      <Typography overrideDefaults as="p" className="text-sm">
        {label}
      </Typography>
    </Container>
  );
}
