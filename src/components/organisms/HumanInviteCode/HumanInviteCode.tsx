'use client';
import { Button } from '@/atoms/Button/Button';
import { Card } from '@/atoms/Card/Card';
import { Container } from '@/atoms/Container/Container';
import { Image } from '@/atoms/Image/Image';
import { Input } from '@/atoms/Input/Input';
import { Link } from '@/atoms/Link/Link';
import { PageHeader } from '@/atoms/PageHeader/PageHeader';
import { PageSubtitle } from '@/atoms/PageSubtitle/PageSubtitle';
import { Typography } from '@/atoms/Typography/Typography';

import { TWITTER_URL, TELEGRAM_URL } from '@/config/externalLinks';
import { HumanFooter } from '@/molecules/HumanFooter/HumanFooter';
import { PageTitle } from '@/molecules/Page/Page';
import { PopoverInviteHomeserver } from '@/molecules/PopoverInviteHomeserver/PopoverInviteHomeserver';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { formatInviteCode } from './HumanInviteCode.utils';
import type { HumanInviteCodeProps } from './HumanInviteCode.types';

/**
 * Component for entering an invite code for homeserver during onboarding.
 * The parent validates the code with the homeserver before navigating; onSuccess may throw on invalid code.
 * @param onBack - Function to call when the user clicks the back button.
 * @param onSuccess - Called with the trimmed invite code; may be async. Throws on validation failure.
 */
import { CircleCheck, Server, ArrowLeft, Loader2, ArrowRight } from 'lucide-react';
import { XTwitter, Telegram } from '@/icons';
import { Logger } from '@/libs/logger/logger';
import { cn } from '@/libs/utils/utils';
import { AuthController } from '@/controllers/auth/auth';
export const HumanInviteCode = ({ onBack, onSuccess }: HumanInviteCodeProps) => {
  const t = useTranslations('onboarding.inviteCode');
  const tCommon = useTranslations('common');
  const [inviteCode, setInviteCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const trimmedInviteCode = inviteCode.trim();
  const isInviteCodeEntered = trimmedInviteCode.length === 14;
  async function handleSubmit() {
    if (!isInviteCodeEntered || isSubmitting) {
      return;
    }
    setIsSubmitting(true);
    try {
      await onSuccess(trimmedInviteCode);
    } catch {
      setIsSubmitting(false);
    }
  }

  // generate an invite code and put it in console log if you are in development mode
  React.useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      AuthController.generateSignupToken()
        .then((token) => {
          Logger.info(token, token);
        })
        .catch((error) => {
          Logger.error('[HumanInviteCode] Failed to generate signup token', {
            error,
          });
        });
    }
  }, []);
  return (
    <React.Fragment>
      <PageHeader>
        <PageTitle size="large">
          {t.rich('title', {
            highlight: (chunks) => <span className="text-brand">{chunks}</span>,
          })}
        </PageTitle>
        <Container className="flex-row items-center gap-3">
          <PageSubtitle>{t('subtitle')}</PageSubtitle>
          <Link href={TWITTER_URL} target="_blank" className="text-muted-foreground hover:text-brand">
            <XTwitter className="h-6 w-6" />
          </Link>
          <Link href={TELEGRAM_URL} target="_blank" className="text-muted-foreground hover:text-brand">
            <Telegram className="h-6 w-6" />
          </Link>
        </Container>
      </PageHeader>

      <Card data-testid="human-invite-code-card" className="flex-row items-start gap-12 overflow-hidden p-12">
        {/* Gift Image */}
        <Container className="hidden shrink-0 lg:flex lg:h-48 lg:w-48">
          <Image src="/images/gift.webp" alt="Gift" width={192} height={192} className="h-full w-full object-cover" />
        </Container>

        {/* Content */}
        <Container className="flex max-w-xl min-w-0 flex-1 flex-col gap-6">
          {/* Header */}
          <Container className="gap-3">
            <Container className="flex-row items-center gap-1">
              <Typography as="h3" className="text-2xl leading-8 font-bold text-foreground">
                {t('label')}
              </Typography>
              <PopoverInviteHomeserver className="h-6 w-6 opacity-80" />
            </Container>
            <Typography as="p" className="text-base leading-6 font-medium text-secondary-foreground/80">
              {t('hint')}
            </Typography>
          </Container>

          {/* Form */}
          <Container className="gap-6">
            {/* Input */}
            <Container
              className={cn(
                'flex-row items-center gap-3 rounded-md border border-dashed bg-background/10 px-5 py-4 shadow-xs',
                isInviteCodeEntered ? 'border-brand' : 'border-input',
              )}
            >
              <Input
                data-testid="human-invite-code-input"
                data-cy="human-invite-code-input"
                type="text"
                autoFocus
                value={inviteCode}
                onChange={(e) => setInviteCode(formatInviteCode(e.target.value))}
                placeholder={t('placeholder')}
                maxLength={14}
                className={cn(
                  'h-auto flex-1 border-none bg-transparent p-0 text-base font-medium placeholder:text-muted-foreground focus:ring-0 focus:outline-none',
                  isInviteCodeEntered ? 'font-bold text-brand' : 'text-foreground',
                )}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && isInviteCodeEntered) {
                    handleSubmit();
                  }
                }}
              />
              {isInviteCodeEntered && <CircleCheck className="h-6 w-6 shrink-0 text-brand" />}
            </Container>

            {/* Custom homeserver row */}
            <Container className="flex-col items-center gap-4 sm:flex-row">
              <Button
                variant="secondary"
                className="shrink-0 rounded-full opacity-40"
                disabled
                aria-label={t('customHomeserver')}
              >
                <Server className="mr-2 h-4 w-4" />
                {t('customHomeserver')}
              </Button>
              <Typography as="p" className="text-base leading-6 font-medium text-secondary-foreground">
                {t('customHomeserverHint')}
              </Typography>
            </Container>
          </Container>
        </Container>
      </Card>

      <HumanFooter />

      {/* Buttons container */}
      <Container className={cn('mt-6 flex-row justify-between gap-3 lg:gap-6')}>
        <Button
          id="human-invite-back-btn"
          size="lg"
          className="w-full flex-1 rounded-full md:flex-0"
          variant="secondary"
          onClick={onBack}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {tCommon('back')}
        </Button>
        <Button
          id="human-invite-continue-btn"
          data-cy="human-invite-code-continue-btn"
          size="lg"
          className="w-full flex-1 rounded-full md:flex-0"
          variant="default"
          disabled={!isInviteCodeEntered || isSubmitting}
          onClick={handleSubmit}
        >
          {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
          {tCommon('continue')}
        </Button>
      </Container>
    </React.Fragment>
  );
};
