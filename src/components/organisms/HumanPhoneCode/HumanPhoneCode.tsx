'use client';

import * as Atoms from '@/atoms';
import * as Core from '@/core';
import * as Libs from '@/libs';
import * as Molecules from '@/molecules';
import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { HumanPhoneCodeProps } from './HumanPhoneCode.types';

export const HumanPhoneCode = ({ phoneNumber, onBack, onSuccess }: HumanPhoneCodeProps) => {
  const t = useTranslations('onboarding.phoneCode');
  const [code, setCode] = useState<string[]>(['', '', '', '', '', '']);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const { toast } = Molecules.useToast();

  const [resendTimer, setResendTimer] = useState<number>(60);
  React.useEffect(() => {
    const intervalId = setInterval(() => {
      setResendTimer((previous) => {
        let newResendTimer = previous - 1;
        if (newResendTimer < 0) {
          newResendTimer = 0;
        }
        return newResendTimer;
      });
    }, 1000);

    return () => clearInterval(intervalId);
  }, []);

  // Verify the code
  async function onVerifyCode() {
    const codeValue = code.join('');
    try {
      setIsVerifyingCode(true);
      const result = await Core.HomegateController.verifySmsCode({ phoneNumber, code: codeValue });
      if (result.valid && result.signupCode) {
        toast({
          title: t('valid'),
        });
        onSuccess(result.signupCode);
      } else {
        toast({
          title: t('invalid'),
        });
        setIsVerifyingCode(false);
      }
    } catch {
      toast({
        title: t('verifyFailed'),
        description: t('verifyFailedDescription'),
      });
      setIsVerifyingCode(false);
    }
  }
  const isCodeComplete = code.every((digit) => digit !== '') && code.join('').length === 6;

  return (
    <React.Fragment>
      <Atoms.PageHeader>
        <Molecules.PageTitle size="large">
          {t.rich('title', {
            highlight: (chunks) => <span className="text-brand">{chunks}</span>,
          })}
        </Molecules.PageTitle>
        <Atoms.PageSubtitle>{t('subtitle', { phoneNumber })}</Atoms.PageSubtitle>
      </Atoms.PageHeader>

      {/* Verification code card */}
      <Atoms.Card data-testid="human-phone-code-card" className="gap-0 p-6 lg:p-12">
        <Atoms.Container className="flex-col gap-12 lg:flex-row lg:items-start">
          {/* Phone image */}
          <Atoms.Container className="flex hidden h-full w-full items-center lg:block lg:w-auto">
            <Atoms.Image
              priority={true}
              src="/images/sms-verification-phone.webp"
              alt="Pubky phone representing phone verification"
              className="h-auto w-[192px] max-w-full"
            />
          </Atoms.Container>

          {/* Content section */}
          <Atoms.Container className="w-full flex-1 flex-col gap-6">
            {/* Card header */}
            <Atoms.Container className="flex-col gap-3">
              <Atoms.Typography as="h3" className="text-2xl leading-[32px] font-semibold text-foreground">
                {t('label')}
              </Atoms.Typography>
              <Atoms.Typography as="p" className="text-base leading-6 font-medium text-secondary-foreground/80">
                {t('hint', { phoneNumber })}
              </Atoms.Typography>
            </Atoms.Container>

            <Molecules.HumanPhoneCodeInput
              value={code}
              onChange={setCode}
              onEnter={() => isCodeComplete && !isVerifyingCode && onVerifyCode()}
            />
          </Atoms.Container>
        </Atoms.Container>
      </Atoms.Card>

      {/* Buttons */}
      <Atoms.Container className={Libs.cn('mt-6 flex-row justify-between gap-3 lg:gap-6')}>
        <Atoms.Button
          data-testid="human-phone-resend-code-btn"
          id="human-phone-back-btn"
          size="lg"
          className="w-full flex-1 rounded-full md:flex-0"
          variant="secondary"
          disabled={resendTimer > 0}
          onClick={onBack}
        >
          <Libs.RefreshCcw className="mr-2 h-4 w-4" />
          {resendTimer > 0 ? t('resendTimer', { seconds: resendTimer }) : t('resend')}
        </Atoms.Button>
        <Atoms.Button
          data-testid="human-phone-send-code-btn"
          id="human-phone-send-code-btn"
          size="lg"
          className="w-full flex-1 rounded-full md:flex-0"
          variant="default"
          disabled={!isCodeComplete || isVerifyingCode}
          onClick={() => isCodeComplete && !isVerifyingCode && onVerifyCode()}
        >
          <Libs.ArrowRight className="mr-2 h-4 w-4" />
          {t('verify')}
        </Atoms.Button>
      </Atoms.Container>
    </React.Fragment>
  );
};
