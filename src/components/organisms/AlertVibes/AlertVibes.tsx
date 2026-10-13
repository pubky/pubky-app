'use client';

import { WandSparkles } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { useVibesAlert } from '@/hooks/useVibesAlert/useVibesAlert';
import { VibesLink } from '@/molecules/VibesLink/VibesLink';

export function AlertVibes() {
  const { visible, remindLater } = useVibesAlert();
  if (!visible) return null;

  return (
    <Container
      role="region"
      aria-label="Discover Pubky Vibes"
      data-testid="alert-vibes"
      className="gap-3 rounded-lg bg-brand px-6 py-3 sm:flex-row sm:items-center"
    >
      <Container className="min-w-0 flex-1 flex-row items-start gap-3">
        <WandSparkles aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary-foreground" />
        <Typography size="sm" className="min-w-0 font-bold text-primary-foreground">
          Check out experimental features at{' '}
          <VibesLink className="text-inherit no-underline">vibes.pubky.app</VibesLink>!
        </Typography>
      </Container>
      <div className="flex shrink-0 items-center justify-end gap-3">
        <Button
          variant="dark-outline"
          size="sm"
          className="bg-input/30 px-3.5 text-xs font-bold text-primary-foreground"
          onClick={remindLater}
        >
          Later
        </Button>
        <Button variant="dark" size="sm" className="border-card bg-card px-3.5 text-xs font-bold" asChild>
          <VibesLink>Try now</VibesLink>
        </Button>
      </div>
    </Container>
  );
}
