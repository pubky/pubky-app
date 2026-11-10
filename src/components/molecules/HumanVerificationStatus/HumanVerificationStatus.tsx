import { TriangleAlert } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Popover, PopoverContent, PopoverTrigger } from '@/atoms/Popover/Popover';
import { Typography } from '@/atoms/Typography/Typography';
import { cn } from '@/libs/utils/utils';
import type { HumanVerificationStatusProps } from './HumanVerificationStatus.types';

export function HumanVerificationStatus({ layout, reason, method, testId }: HumanVerificationStatusProps) {
  const title = reason === 'geoblocked' ? 'Not available in your country' : 'Service temporarily unavailable';

  if (layout === 'desktop') {
    return (
      <Container
        overrideDefaults
        data-testid={testId}
        role="status"
        className={cn(
          'absolute inset-x-12 top-49 z-10 hidden items-start gap-3 rounded-md px-6 py-3 lg:flex',
          reason === 'geoblocked'
            ? 'bg-brand text-brand-foreground'
            : 'bg-destructive-button text-destructive-foreground',
        )}
      >
        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <Typography overrideDefaults className="text-sm leading-5 font-bold">
          {title}
        </Typography>
      </Container>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant={reason === 'geoblocked' ? 'brand' : 'destructive'}
          size="icon"
          data-testid={testId}
          aria-label={
            method === 'payment' ? 'Why Bitcoin payment is unavailable' : 'Why phone verification is unavailable'
          }
          className="absolute top-1/2 right-4 size-8 -translate-y-1/2 border-0 lg:hidden"
        >
          <TriangleAlert className="size-4" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        aria-label={title}
        align="end"
        side="top"
        sideOffset={12}
        collisionPadding={16}
        className="mx-0 w-80 p-6 lg:hidden"
      >
        <Container className="gap-2">
          <Typography className="font-bold">{title}</Typography>
          <Typography size="sm" className="text-muted-foreground">
            {'Try a different verification method'}
          </Typography>
        </Container>
      </PopoverContent>
    </Popover>
  );
}
