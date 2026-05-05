import React from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { PageHeader } from '@/atoms/PageHeader/PageHeader';
import { PageSubtitle } from '@/atoms/PageSubtitle/PageSubtitle';
import { Typography } from '@/atoms/Typography/Typography';
import { HumanFooter } from '@/molecules/HumanFooter/HumanFooter';
import { HumanSmsCard } from '@/molecules/HumanSmsCard/HumanSmsCard';
import { PageTitle } from '@/molecules/Page/Page';
import { HumanBitcoinCard } from '../HumanBitcoinCard/HumanBitcoinCard';
import type { HumanSelectionProps } from './HumanSelection.types';

export const HumanSelection = ({ onClick, onInviteCodeClick, onDevMode }: HumanSelectionProps) => {
  const t = useTranslations('onboarding.human');
  // Show dev mode options if in development mode or Cypress is running (for E2E tests)
  const isCypressRunning = typeof window !== 'undefined' && 'Cypress' in window;
  const isDevMode = process.env.NODE_ENV === 'development' || isCypressRunning;
  return (
    <React.Fragment>
      <PageHeader>
        <PageTitle size="large">
          {t.rich('title', {
            highlight: (chunks) => <span className="text-brand">{chunks}</span>,
          })}
        </PageTitle>
        <PageSubtitle>
          {t('subtitle')}{' '}
          <Button
            overrideDefaults
            onClick={onInviteCodeClick}
            className="inline cursor-pointer text-brand transition-all hover:font-bold"
            data-testid="invite-code-link"
            data-cy="invite-code-link"
          >
            {t('inviteCode')}
          </Button>
        </PageSubtitle>
      </PageHeader>

      <Container data-testid="human-verification-cards" className="gap-6 lg:flex-row lg:items-stretch lg:gap-8">
        <HumanSmsCard onClick={() => onClick('sms')} />
        <HumanBitcoinCard onClick={() => onClick('payment')} />
      </Container>
      {isDevMode && (
        <Container className="relative mt-6 flex items-start rounded border px-4 py-6">
          <Typography
            as="p"
            className="absolute top-[-14px] left-[-6px] ml-4 bg-background px-2 text-base leading-6 font-medium text-secondary-foreground/80"
          >
            {t('devMode')}
          </Typography>
          <Container className="flex flex-row gap-2">
            <Button data-testid="human-dev-skip-btn" variant="secondary" onClick={() => onDevMode('skip')} className="">
              {t('skip')}
            </Button>
            <Button
              data-testid="human-dev-invite-code-btn"
              variant="secondary"
              onClick={() => onDevMode('inviteCode')}
              className=""
            >
              {t('enterInviteCode')}
            </Button>
          </Container>
        </Container>
      )}
      <HumanFooter />
    </React.Fragment>
  );
};
