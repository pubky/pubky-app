'use client';

import { useTranslations } from 'next-intl';
import * as Atoms from '@/components/atoms';
import * as Libs from '@/libs';
import { AlertTriangle } from 'lucide-react';
export function PopoverTradeoffs({ ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const t = useTranslations('tradeoffs');
  return (
    <Atoms.Popover hover>
      <Atoms.PopoverTrigger asChild>
        <Atoms.Button variant="ghost" size="icon" className={Libs.cn('rounded-full', props.className)}>
          <AlertTriangle className="h-4 w-4" data-testid="alert-triangle-icon" />
        </Atoms.Button>
      </Atoms.PopoverTrigger>
      <Atoms.PopoverContent>
        <Atoms.Container className="gap-2 px-3 py-2">
          <Atoms.Container className="gap-2">
            <Atoms.Heading level={4} size="sm" className="text-popover-foreground">
              {t('title')}
            </Atoms.Heading>
          </Atoms.Container>
          <Atoms.Container className="flex gap-4">
            <ul className="list-inside list-disc text-sm text-muted-foreground">
              <li>{t('lessSecure')}</li>
              <li>{t('browserBased')}</li>
              <li>{t('suboptimalSignIn')}</li>
            </ul>
          </Atoms.Container>
        </Atoms.Container>
      </Atoms.PopoverContent>
    </Atoms.Popover>
  );
}
