'use client';
/**
 * Component for entering an invite code for homeserver during onboarding.
 * The parent verifies the code with the homeserver when all characters are entered; Continue is enabled
 * only after verification succeeds.
 * @param onBack - Function to call when the user clicks the back button.
 * @param onVerify - Called with the trimmed invite code when the full code is entered.
 * @param onSuccess - Called when the user clicks Continue after successful verification.
 */
import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CircleCheck, Loader2, Server } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Image } from '@/atoms/Image/Image';
import { Input } from '@/atoms/Input/Input';
import { Link } from '@/atoms/Link/Link';
import { PageHeader } from '@/atoms/PageHeader/PageHeader';
import { PageSubtitle } from '@/atoms/PageSubtitle/PageSubtitle';
import { Typography } from '@/atoms/Typography/Typography';
import { getTelegramLink, getTwitterLink } from '@/config/externalLinks';
import { AuthController } from '@/controllers/auth/auth';
import { Telegram, XTwitter } from '@/icons';
import { Logger } from '@/libs/logger/logger';
import { cn } from '@/libs/utils/utils';
import { HumanFooter } from '@/molecules/HumanFooter/HumanFooter';
import { IllustratedCard } from '@/molecules/IllustratedCard/IllustratedCard';
import { PageTitle } from '@/molecules/Page/Page';
import { PopoverInviteHomeserver } from '@/molecules/PopoverInviteHomeserver/PopoverInviteHomeserver';
import type { HumanInviteCodeProps, InviteCodeVerificationResult } from './HumanInviteCode.types';
import { formatInviteCode } from './HumanInviteCode.utils';

export const HumanInviteCode = ({ onBack, onVerify, onSuccess }: HumanInviteCodeProps) => {
  const t = useTranslations('onboarding.inviteCode');
  const tCommon = useTranslations('common');
  const [inviteCode, setInviteCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [verificationOutcome, setVerificationOutcome] = useState<InviteCodeVerificationResult | null>(null);
  const [verifiedInviteCode, setVerifiedInviteCode] = useState<string | null>(null);
  const showDestructiveBorder = !isVerifying && (verificationOutcome === 'invalid' || verificationOutcome === 'used');
  const trimmedInviteCode = inviteCode.trim();
  const isInviteCodeEntered = trimmedInviteCode.length === 14;
  const onVerifyRef = useRef(onVerify);
  onVerifyRef.current = onVerify;

  useEffect(() => {
    if (!isInviteCodeEntered) {
      setIsVerified(false);
      setVerificationOutcome(null);
      setVerifiedInviteCode(null);
      return;
    }

    if (trimmedInviteCode === verifiedInviteCode) {
      return;
    }

    let cancelled = false;

    async function verifyInviteCode() {
      setIsVerifying(true);
      setIsVerified(false);
      setVerificationOutcome(null);
      try {
        const result = await onVerifyRef.current(trimmedInviteCode);
        if (cancelled) {
          return;
        }
        if (result === 'valid') {
          setIsVerified(true);
          setVerificationOutcome(null);
          setVerifiedInviteCode(trimmedInviteCode);
        } else {
          setIsVerified(false);
          setVerificationOutcome(result);
          setVerifiedInviteCode(null);
        }
      } finally {
        if (!cancelled) {
          setIsVerifying(false);
        }
      }
    }

    void verifyInviteCode();

    return () => {
      cancelled = true;
    };
  }, [isInviteCodeEntered, trimmedInviteCode, verifiedInviteCode]);

  function handleSubmit() {
    if (!isVerified || isVerifying || verifiedInviteCode === null) {
      return;
    }
    onSuccess(verifiedInviteCode);
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
          <Link href={getTwitterLink()} target="_blank" className="text-muted-foreground hover:text-brand">
            <XTwitter className="h-6 w-6" />
          </Link>
          <Link href={getTelegramLink()} target="_blank" className="text-muted-foreground hover:text-brand">
            <Telegram className="h-6 w-6" />
          </Link>
        </Container>
      </PageHeader>

      <IllustratedCard
        data-testid="human-invite-code-card"
        className="overflow-hidden rounded-md"
        visual={<Image src="/images/gift.webp" alt="Gift" width={192} height={192} className="size-48 object-cover" />}
      >
        <Container className="flex-col gap-3">
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

        <Container className="flex-col gap-6">
          <Container
            data-testid="human-invite-code-input-field"
            className={cn(
              'flex-row items-center gap-3 rounded-md border border-dashed bg-background/10 px-6 py-4 shadow-xs',
              isVerified && !isVerifying
                ? 'border-brand'
                : showDestructiveBorder
                  ? 'border-destructive'
                  : 'border-input',
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
                isVerified && !isVerifying ? 'font-bold text-brand' : 'text-foreground',
              )}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && isVerified && !isVerifying) {
                  handleSubmit();
                }
              }}
            />
            {isVerifying && <Loader2 className="h-6 w-6 shrink-0 animate-spin text-brand" />}
            {isVerified && !isVerifying && <CircleCheck className="h-6 w-6 shrink-0 text-brand" />}
          </Container>

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
      </IllustratedCard>

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
          disabled={!isVerified || isVerifying}
          onClick={handleSubmit}
        >
          <ArrowRight className="mr-2 h-4 w-4" />
          {tCommon('continue')}
        </Button>
      </Container>
    </React.Fragment>
  );
};
