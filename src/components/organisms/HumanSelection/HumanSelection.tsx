import React from 'react';
import { Gift } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Image } from '@/atoms/Image/Image';
import { PageHeader } from '@/atoms/PageHeader/PageHeader';
import { PageSubtitle } from '@/atoms/PageSubtitle/PageSubtitle';
import { Typography } from '@/atoms/Typography/Typography';
import { HumanSmsCard } from '@/molecules/HumanSmsCard/HumanSmsCard';
import { IllustratedCard } from '@/molecules/IllustratedCard/IllustratedCard';
import { PageTitle } from '@/molecules/Page/Page';
import { HumanBitcoinCard } from '../HumanBitcoinCard/HumanBitcoinCard';
import type { HumanSelectionProps } from './HumanSelection.types';

export const HumanSelection = ({ onClick, onInviteCodeClick, onDevMode }: HumanSelectionProps) => {
  // Show dev mode options if in development mode or Cypress is running (for E2E tests)
  const isCypressRunning = typeof window !== 'undefined' && 'Cypress' in window;
  const isDevMode = process.env.NODE_ENV === 'development' || isCypressRunning;
  return (
    <React.Fragment>
      <PageHeader className="pt-0">
        <PageTitle size="large">
          {'Prove you’re '}
          <span className="block text-brand lg:inline">{'not a robot.'}</span>
        </PageTitle>
        <PageSubtitle className="leading-7 lg:leading-8">
          {'Verify to get 1GB of storage, used for your posts, media, and your profile.'}
        </PageSubtitle>
      </PageHeader>

      <Container
        data-testid="human-verification-cards"
        display="grid"
        className="gap-3 rounded-md bg-card p-6 lg:grid-cols-3 lg:gap-6 lg:bg-transparent lg:p-0"
      >
        <Typography as="h3" className="mb-3 text-xl leading-7 font-bold lg:hidden">
          {'Pick verification method'}
        </Typography>
        <HumanBitcoinCard onClick={() => onClick('payment')} />
        <HumanSmsCard onClick={() => onClick('sms')} />
        <IllustratedCard
          data-testid="invite-code-option-card"
          layout="column"
          className="contents lg:flex lg:min-w-0 lg:rounded-md"
          layoutClassName="contents lg:flex lg:flex-1 lg:gap-6"
          contentClassName="contents lg:flex"
          visualClassName="mx-auto"
          visual={
            <Image
              priority
              src="/images/gift.webp"
              alt="Lime Pubky gift representing an invite code"
              width={192}
              height={192}
              className="size-48"
            />
          }
        >
          <Container className="hidden gap-3 lg:flex">
            <Typography as="h3" className="text-xl leading-7 font-bold text-foreground lg:text-2xl lg:leading-8">
              {'Invite code'}
            </Typography>
            <Typography
              as="p"
              className="text-xs leading-4 font-medium tracking-widest text-muted-foreground uppercase"
            >
              {'Ask us for an invite code'}
            </Typography>
          </Container>
          <Button
            variant="secondary"
            size="lg"
            onClick={onInviteCodeClick}
            className="w-full border-0 lg:mt-auto"
            data-testid="invite-code-link"
            data-cy="invite-code-link"
          >
            <Gift className="size-4" aria-hidden="true" />
            {'Invite code'}
          </Button>
        </IllustratedCard>
      </Container>
      {isDevMode && (
        <Container className="relative mt-6 flex items-start rounded border px-4 py-6">
          <Typography
            as="p"
            className="absolute top-[-14px] left-[-6px] ml-4 bg-background px-2 text-base leading-6 font-medium text-secondary-foreground/80"
          >
            {'Dev Mode'}
          </Typography>
          <Container className="flex flex-row gap-2">
            <Button data-testid="human-dev-skip-btn" variant="secondary" onClick={() => onDevMode('skip')} className="">
              {'Skip'}
            </Button>
            <Button
              data-testid="human-dev-invite-code-btn"
              variant="secondary"
              onClick={() => onDevMode('inviteCode')}
              className=""
            >
              {'Enter invite code'}
            </Button>
          </Container>
        </Container>
      )}
    </React.Fragment>
  );
};
