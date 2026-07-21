'use client';

import React, { useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { PageHeader } from '@/atoms/PageHeader/PageHeader';
import { PageSubtitle } from '@/atoms/PageSubtitle/PageSubtitle';
import { HomegateController } from '@/controllers/homegate/homegate';
import { parsePhoneNumber } from '@/libs/phone/phone';
import { cn } from '@/libs/utils/utils';
import { HumanPhoneInputField } from '@/molecules/HumanPhoneInputField/HumanPhoneInputField';
import { PageTitle } from '@/molecules/Page/Page';
import { toast } from '@/molecules/Toaster/use-toast';
import { SmsCodeErrorType } from '@/services/homegate/homegate.constants';

type HumanPhoneInputProps = {
  onBack: () => void;
  onCodeSent: (phoneNumber: string) => void;
  initialPhoneNumber?: string;
};

export const HumanPhoneInput = ({ onBack, onCodeSent, initialPhoneNumber }: HumanPhoneInputProps) => {
  const t = useTranslations('onboarding.phone');
  const tCommon = useTranslations('common');
  const [phoneNumberInput, setPhoneNumberInput] = useState(initialPhoneNumber || '');
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [hasAttemptedSend, setHasAttemptedSend] = useState(false);

  const parsedPhoneNumber = parsePhoneNumber(phoneNumberInput);
  const isValidNumber = !!parsedPhoneNumber;
  const showInvalidError = hasAttemptedSend && !isValidNumber;

  const handlePhoneNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhoneNumberInput(e.target.value);
    if (hasAttemptedSend) {
      setHasAttemptedSend(false);
    }
  };

  async function onSendCode(phoneNumber: string) {
    if (isSendingCode) {
      return;
    }
    try {
      setIsSendingCode(true);
      const result = await HomegateController.sendSmsCode(phoneNumber);
      if (!result.success) {
        switch (result.errorType) {
          case SmsCodeErrorType.BLOCKED:
            toast({
              variant: 'error',
              description: t('blockedDescription'),
            });
            break;
          case SmsCodeErrorType.RATE_LIMITED_TEMPORARY: {
            const retryMessage = result.retryAfter
              ? t('rateLimitedWithRetry', {
                  seconds: result.retryAfter,
                })
              : t('tooManyAttemptsDescription');
            toast({
              variant: 'warning',
              description: retryMessage,
            });
            break;
          }
          case SmsCodeErrorType.RATE_LIMITED_WEEKLY:
            toast({
              variant: 'warning',
              description: t('weeklyLimitDescription'),
            });
            break;
          case SmsCodeErrorType.RATE_LIMITED_YEARLY:
            toast({
              variant: 'warning',
              description: t('yearlyLimitDescription'),
            });
            break;
          default:
            toast({
              variant: 'error',
              description: t('sendFailedDescription'),
            });
        }
        return;
      }
      onCodeSent(phoneNumber);
    } catch {
      toast({
        variant: 'error',
        description: t('verificationFailed'),
      });
    } finally {
      setIsSendingCode(false);
    }
  }

  function handleSendCode() {
    if (!parsedPhoneNumber) {
      setHasAttemptedSend(true);
      return;
    }
    setHasAttemptedSend(false);
    void onSendCode(parsedPhoneNumber.format('E.164'));
  }

  return (
    <React.Fragment>
      <PageHeader>
        <PageTitle size="large">
          {t.rich('title', {
            highlight: (chunks) => <span className="text-brand">{chunks}</span>,
          })}
        </PageTitle>
        <PageSubtitle>{t('subtitle')}</PageSubtitle>
      </PageHeader>
      <HumanPhoneInputField
        value={phoneNumberInput}
        onChange={handlePhoneNumberChange}
        isValid={isValidNumber}
        error={showInvalidError ? t('invalidPhone') : undefined}
        onEnter={handleSendCode}
      />
      <Container className={cn('mt-6 flex-row justify-between gap-3 lg:gap-6')}>
        <Button
          id="human-phone-back-btn"
          size="lg"
          className="w-full flex-1 rounded-full md:flex-0"
          variant="secondary"
          onClick={onBack}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {tCommon('back')}
        </Button>
        <Button
          id="human-phone-send-code-btn"
          size="lg"
          className="w-full flex-1 rounded-full md:flex-0"
          variant="default"
          disabled={isSendingCode}
          onClick={handleSendCode}
        >
          <ArrowRight className="mr-2 h-4 w-4" />
          {t('sendCode')}
        </Button>
      </Container>
    </React.Fragment>
  );
};
