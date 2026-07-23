'use client';
import React, { useState } from 'react';
import { ArrowRight, RefreshCcw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/atoms/Button/Button';
import { Card } from '@/atoms/Card/Card';
import { Container } from '@/atoms/Container/Container';
import { Image } from '@/atoms/Image/Image';
import { PageHeader } from '@/atoms/PageHeader/PageHeader';
import { PageSubtitle } from '@/atoms/PageSubtitle/PageSubtitle';
import { Typography } from '@/atoms/Typography/Typography';
import { HomegateController } from '@/controllers/homegate/homegate';
import { cn } from '@/libs/utils/utils';
import { HumanPhoneCodeInput } from '@/molecules/HumanPhoneCodeInput/HumanPhoneCodeInput';
import { PageTitle } from '@/molecules/Page/Page';
import { useToast } from '@/molecules/Toaster/use-toast';
import type { HumanPhoneCodeProps } from './HumanPhoneCode.types';

export const HumanPhoneCode = ({ phoneNumber, onBack, onSuccess }: HumanPhoneCodeProps) => {
  const t = useTranslations('onboarding.phoneCode');
  const [code, setCode] = useState<string[]>(['', '', '', '', '', '']);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const { toast } = useToast();
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
      const result = await HomegateController.verifySmsCode({
        phoneNumber,
        code: codeValue,
      });
      if (result.valid && result.signupCode) {
        toast({
          title: t('valid'),
        });
        onSuccess(result.signupCode);
      } else {
        toast({
          variant: 'warning',
          title: t('invalid'),
        });
        setIsVerifyingCode(false);
      }
    } catch {
      toast({
        variant: 'error',
        description: t('verifyFailedDescription'),
      });
      setIsVerifyingCode(false);
    }
  }
  const isCodeComplete = code.every((digit) => digit !== '') && code.join('').length === 6;
  return (
    <React.Fragment>
      <PageHeader>
        <PageTitle size="large">
          {t.rich('title', {
            highlight: (chunks) => <span className="text-brand">{chunks}</span>,
          })}
        </PageTitle>
        <PageSubtitle>
          {t('subtitle', {
            phoneNumber,
          })}
        </PageSubtitle>
      </PageHeader>

      {/* Verification code card */}
      <Card data-testid="human-phone-code-card" className="gap-0 p-6 lg:p-12">
        <Container className="mx-0 w-full flex-col gap-4 lg:flex-row lg:items-start lg:gap-12">
          <Container className="mx-0 hidden w-48 shrink-0 lg:block">
            <Image
              priority={true}
              src="/images/sms-verification-code.webp"
              alt="Pubky padlock representing verification code"
              className="size-48"
            />
          </Container>

          <Container className="mx-0 w-full flex-col items-start gap-6 text-left lg:max-w-xl lg:flex-1">
            <Container className="mx-0 w-full flex-col items-start gap-3 text-left">
              <Typography as="h3" className="text-2xl leading-[32px] font-semibold text-foreground">
                {t('label')}
              </Typography>
              <div className="w-full text-base leading-6 font-medium text-secondary-foreground/80">
                <Typography as="p" overrideDefaults className="leading-6">
                  {t('hint', {
                    phoneNumber,
                  })}
                </Typography>
                <Typography as="p" overrideDefaults className="leading-6">
                  {t('hintChannels')}
                </Typography>
              </div>
            </Container>

            <HumanPhoneCodeInput
              value={code}
              onChange={setCode}
              onEnter={() => isCodeComplete && !isVerifyingCode && onVerifyCode()}
            />
          </Container>
        </Container>
      </Card>

      {/* Buttons */}
      <Container className={cn('mt-6 flex-row justify-between gap-3 lg:gap-6')}>
        <Button
          data-testid="human-phone-resend-code-btn"
          id="human-phone-back-btn"
          size="lg"
          className="w-full flex-1 rounded-full md:flex-0"
          variant="secondary"
          disabled={resendTimer > 0}
          onClick={onBack}
        >
          <RefreshCcw className="mr-2 h-4 w-4" />
          {resendTimer > 0
            ? t('resendTimer', {
                seconds: resendTimer,
              })
            : t('resend')}
        </Button>
        <Button
          data-testid="human-phone-send-code-btn"
          id="human-phone-send-code-btn"
          size="lg"
          className="w-full flex-1 rounded-full md:flex-0"
          variant="default"
          disabled={!isCodeComplete || isVerifyingCode}
          onClick={() => isCodeComplete && !isVerifyingCode && onVerifyCode()}
        >
          <ArrowRight className="mr-2 h-4 w-4" />
          {t('verify')}
        </Button>
      </Container>
    </React.Fragment>
  );
};
