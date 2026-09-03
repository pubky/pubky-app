'use client';

import React, { useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { PageHeader } from '@/atoms/PageHeader/PageHeader';
import { PageSubtitle } from '@/atoms/PageSubtitle/PageSubtitle';
import { HomegateController } from '@/controllers/homegate/homegate';
import { parsePhoneNumber } from '@/libs/phone/phone';
import { cn } from '@/libs/utils/utils';
import { HumanPhoneInputField } from '@/molecules/HumanPhoneInputField/HumanPhoneInputField';
import { PageTitle } from '@/molecules/Page/Page';
import { toast } from '@/molecules/Toaster/toast';
import { SmsCodeErrorType } from '@/services/homegate/homegate.constants';

type HumanPhoneInputProps = {
  onBack: () => void;
  onCodeSent: (phoneNumber: string) => void;
  initialPhoneNumber?: string;
};

export const HumanPhoneInput = ({ onBack, onCodeSent, initialPhoneNumber }: HumanPhoneInputProps) => {
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
              description: 'This phone number cannot be used for verification.',
            });
            break;
          case SmsCodeErrorType.RATE_LIMITED_TEMPORARY: {
            const retryMessage = result.retryAfter
              ? `Too many verification attempts. Retry in ${result.retryAfter}s.`
              : 'Too many verification attempts';
            toast({
              variant: 'warning',
              description: retryMessage,
            });
            break;
          }
          case SmsCodeErrorType.RATE_LIMITED_WEEKLY:
            toast({
              variant: 'warning',
              description: 'Too many verification attempts',
            });
            break;
          case SmsCodeErrorType.RATE_LIMITED_YEARLY:
            toast({
              variant: 'warning',
              description: 'Too many verification attempts',
            });
            break;
          default:
            toast({
              variant: 'error',
              description: 'Could not send verification code. Try again later.',
            });
        }
        return;
      }
      onCodeSent(phoneNumber);
    } catch {
      toast({
        variant: 'error',
        description: 'Phone verification failed. Try again.',
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
          {'Enter '}
          <span className="text-brand">{'Phone.'}</span>
        </PageTitle>
        <PageSubtitle>{'We will send you a verification code.'}</PageSubtitle>
      </PageHeader>
      <HumanPhoneInputField
        value={phoneNumberInput}
        onChange={handlePhoneNumberChange}
        isValid={isValidNumber}
        error={showInvalidError ? 'Enter a valid mobile number including country code.' : undefined}
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
          {'Back'}
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
          {'Send Code'}
        </Button>
      </Container>
    </React.Fragment>
  );
};
