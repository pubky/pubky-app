'use client';

import { AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { Popover, PopoverContent, PopoverTrigger } from '@/atoms/Popover/Popover';
import { cn } from '@/libs/utils/utils';

export function PopoverTradeoffs({ ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const t = useTranslations('tradeoffs');
  return (
    <Popover hover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className={cn('rounded-full', props.className)}>
          <AlertTriangle className="h-4 w-4" data-testid="alert-triangle-icon" />
        </Button>
      </PopoverTrigger>
      <PopoverContent>
        <Container className="gap-2 px-3 py-2">
          <Container className="gap-2">
            <Heading level={4} size="sm" className="text-popover-foreground">
              {t('title')}
            </Heading>
          </Container>
          <Container className="flex gap-4">
            <ul className="list-inside list-disc text-sm text-muted-foreground">
              <li>{t('lessSecure')}</li>
              <li>{t('browserBased')}</li>
              <li>{t('suboptimalSignIn')}</li>
            </ul>
          </Container>
        </Container>
      </PopoverContent>
    </Popover>
  );
}
