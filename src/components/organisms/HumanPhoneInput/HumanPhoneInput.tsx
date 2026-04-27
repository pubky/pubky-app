'use client';

import * as Atoms from '@/atoms';
import * as Core from '@/core';
import * as Molecules from '@/molecules';
import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { HumanPhoneInputProps } from './HumanPhoneInput.types';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { parsePhoneNumber } from '@/libs/phone/phone';
import { cn } from '@/libs/utils/utils';
export const HumanPhoneInput = ({ onBack, onCodeSent, initialPhoneNumber }: HumanPhoneInputProps) => {
  const t = useTranslations('onboarding.phone');
  const tCommon = useTranslations('common');
  const [phoneNumberInput, setPhoneNumberInput] = useState(initialPhoneNumber || '');
  const [isSendingCode, setIsSendingCode] = useState(false);
  const handlePhoneNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhoneNumberInput(e.target.value);
  };
  const isValidNumber = !!parsePhoneNumber(phoneNumberInput);
  async function onSendCode(phoneNumber: string) {
    if (isSendingCode) {
      return;
    }
    try {
      setIsSendingCode(true);
      const result = await Core.HomegateController.sendSmsCode(phoneNumber);
      if (!result.success) {
        switch (result.errorType) {
          case Core.SmsCodeErrorType.BLOCKED:
            Molecules.toast({
              title: t('blocked'),
              description: t('blockedDescription'),
            });
            break;
          case Core.SmsCodeErrorType.RATE_LIMITED_TEMPORARY: {
            const retryMessage = result.retryAfter
              ? t('rateLimitedWithRetry', {
                  seconds: result.retryAfter,
                })
              : t('tooManyAttemptsDescription');
            Molecules.toast({
              title: t('tooManyAttempts'),
              description: retryMessage,
            });
            break;
          }
          case Core.SmsCodeErrorType.RATE_LIMITED_WEEKLY:
            Molecules.toast({
              title: t('weeklyLimitReached'),
              description: t('weeklyLimitDescription'),
            });
            break;
          case Core.SmsCodeErrorType.RATE_LIMITED_YEARLY:
            Molecules.toast({
              title: t('yearlyLimitReached'),
              description: t('yearlyLimitDescription'),
            });
            break;
          default:
            Molecules.toast({
              title: t('sendFailed'),
              description: t('sendFailedDescription'),
            });
        }
        return;
      }
      onCodeSent(phoneNumber);
    } catch {
      Molecules.toast({
        title: t('sendFailed'),
        description: t('sendFailedDescription'),
      });
    } finally {
      setIsSendingCode(false);
    }
  }
  return (
    <React.Fragment>
      <Atoms.PageHeader>
        <Molecules.PageTitle size="large">
          {t.rich('title', {
            highlight: (chunks) => <span className="text-brand">{chunks}</span>,
          })}
        </Molecules.PageTitle>
        <Atoms.PageSubtitle>{t('subtitle')}</Atoms.PageSubtitle>
      </Atoms.PageHeader>
      <Molecules.HumanPhoneInputField
        value={phoneNumberInput}
        onChange={handlePhoneNumberChange}
        isValid={isValidNumber}
        onEnter={() => isValidNumber && onSendCode(phoneNumberInput)}
      />
      <Atoms.Container className={cn('mt-6 flex-row justify-between gap-3 lg:gap-6')}>
        <Atoms.Button
          id="human-phone-back-btn"
          size="lg"
          className="w-full flex-1 rounded-full md:flex-0"
          variant="secondary"
          onClick={onBack}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {tCommon('back')}
        </Atoms.Button>
        <Atoms.Button
          id="human-phone-send-code-btn"
          size="lg"
          className="w-full flex-1 rounded-full md:flex-0"
          variant="default"
          disabled={!isValidNumber || isSendingCode}
          onClick={() => isValidNumber && onSendCode(phoneNumberInput)}
        >
          <ArrowRight className="mr-2 h-4 w-4" />
          {t('sendCode')}
        </Atoms.Button>
      </Atoms.Container>
    </React.Fragment>
  );
};
