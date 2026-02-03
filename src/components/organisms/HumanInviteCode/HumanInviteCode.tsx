'use client';

import * as Atoms from '@/atoms';
import * as Config from '@/config';
import * as Core from '@/core';
import * as Libs from '@/libs';
import * as Molecules from '@/molecules';
import React, { useState } from 'react';
import { useTranslations } from 'next-intl';

import { formatInviteCode } from './HumanInviteCode.utils';
import type { HumanInviteCodeProps } from './HumanInviteCode.types';

/**
 * Component for entering an invite code for homeserver during onboarding.
 * @param onBack - Function to call when the user clicks the back button.
 * @param onSuccess - Function to call when the user successfully enters the invite code.
 */
export const HumanInviteCode = ({ onBack, onSuccess }: HumanInviteCodeProps) => {
  const t = useTranslations('onboarding.inviteCode');
  const tCommon = useTranslations('common');
  const [inviteCode, setInviteCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const trimmedInviteCode = inviteCode.trim();
  const isInviteCodeEntered = trimmedInviteCode.length === 14;

  function handleSubmit() {
    if (!isInviteCodeEntered || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    onSuccess(trimmedInviteCode);
  }

  // generate an invite code and put it in console log if you are in development mode
  React.useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      Core.AuthController.generateSignupToken()
        .then((token) => {
          Libs.Logger.info(token, token);
        })
        .catch((error) => {
          Libs.Logger.error('[HumanInviteCode] Failed to generate signup token', { error });
        });
    }
  }, []);

  return (
    <React.Fragment>
      <Atoms.PageHeader>
        <Molecules.PageTitle size="large">
          {t.rich('title', {
            highlight: (chunks) => <span className="text-brand">{chunks}</span>,
          })}
        </Molecules.PageTitle>
        <Atoms.Container className="flex-row items-center gap-3">
          <Atoms.PageSubtitle>{t('subtitle')}</Atoms.PageSubtitle>
          <Atoms.Link href={Config.TWITTER_URL} target="_blank" className="text-muted-foreground hover:text-brand">
            <Libs.XTwitter className="h-6 w-6" />
          </Atoms.Link>
          <Atoms.Link href={Config.TELEGRAM_URL} target="_blank" className="text-muted-foreground hover:text-brand">
            <Libs.Telegram className="h-6 w-6" />
          </Atoms.Link>
        </Atoms.Container>
      </Atoms.PageHeader>

      <Atoms.Card data-testid="human-invite-code-card" className="flex-row items-start gap-12 overflow-hidden p-12">
        {/* Gift Image */}
        <Atoms.Container className="hidden shrink-0 lg:flex lg:h-48 lg:w-48">
          <Atoms.Image
            src="/images/gift.webp"
            alt="Gift"
            width={192}
            height={192}
            className="h-full w-full object-cover"
          />
        </Atoms.Container>

        {/* Content */}
        <Atoms.Container className="flex max-w-xl min-w-0 flex-1 flex-col gap-6">
          {/* Header */}
          <Atoms.Container className="gap-3">
            <Atoms.Container className="flex-row items-center gap-1">
              <Atoms.Typography as="h3" className="text-2xl leading-8 font-bold text-foreground">
                {t('label')}
              </Atoms.Typography>
              <Molecules.PopoverInviteHomeserver className="h-6 w-6 opacity-80" />
            </Atoms.Container>
            <Atoms.Typography as="p" className="text-base leading-6 font-medium text-secondary-foreground/80">
              {t('hint')}
            </Atoms.Typography>
          </Atoms.Container>

          {/* Form */}
          <Atoms.Container className="gap-6">
            {/* Input */}
            <Atoms.Container
              className={Libs.cn(
                'flex-row items-center gap-3 rounded-md border border-dashed bg-background/10 px-5 py-4 shadow-xs',
                isInviteCodeEntered ? 'border-brand' : 'border-input',
              )}
            >
              <Atoms.Input
                data-testid="human-invite-code-input"
                data-cy="human-invite-code-input"
                type="text"
                autoFocus
                value={inviteCode}
                onChange={(e) => setInviteCode(formatInviteCode(e.target.value))}
                placeholder={t('placeholder')}
                maxLength={14}
                className={Libs.cn(
                  'h-auto flex-1 border-none bg-transparent p-0 text-base font-medium placeholder:text-muted-foreground focus:ring-0 focus:outline-none',
                  isInviteCodeEntered ? 'font-bold text-brand' : 'text-foreground',
                )}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && isInviteCodeEntered) {
                    handleSubmit();
                  }
                }}
              />
              {isInviteCodeEntered && <Libs.CircleCheck className="h-6 w-6 shrink-0 text-brand" />}
            </Atoms.Container>

            {/* Custom homeserver row */}
            <Atoms.Container className="flex-row items-center gap-4">
              <Atoms.Button
                variant="secondary"
                className="shrink-0 rounded-full opacity-40"
                disabled
                aria-label={t('customHomeserver')}
              >
                <Libs.Server className="mr-2 h-4 w-4" />
                {t('customHomeserver')}
              </Atoms.Button>
              <Atoms.Typography as="p" className="text-base leading-6 font-medium text-secondary-foreground">
                {t('customHomeserverHint')}
              </Atoms.Typography>
            </Atoms.Container>
          </Atoms.Container>
        </Atoms.Container>
      </Atoms.Card>

      <Molecules.HumanFooter />

      {/* Buttons container */}
      <Atoms.Container className={Libs.cn('mt-6 flex-row justify-between gap-3 lg:gap-6')}>
        <Atoms.Button
          id="human-invite-back-btn"
          size="lg"
          className="w-full flex-1 rounded-full md:flex-0"
          variant="secondary"
          onClick={onBack}
        >
          <Libs.ArrowLeft className="mr-2 h-4 w-4" />
          {tCommon('back')}
        </Atoms.Button>
        <Atoms.Button
          id="human-invite-continue-btn"
          data-cy="human-invite-code-continue-btn"
          size="lg"
          className="w-full flex-1 rounded-full md:flex-0"
          variant="default"
          disabled={!isInviteCodeEntered || isSubmitting}
          onClick={handleSubmit}
        >
          {isSubmitting ? (
            <Libs.Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Libs.ArrowRight className="mr-2 h-4 w-4" />
          )}
          {tCommon('continue')}
        </Atoms.Button>
      </Atoms.Container>
    </React.Fragment>
  );
};
