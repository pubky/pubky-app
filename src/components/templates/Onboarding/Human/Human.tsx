'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ONBOARDING_ROUTES } from '@/app/routes';
import { AuthController } from '@/controllers/auth/auth';
import { Logger } from '@/libs/logger/logger';
import { OnboardingLayout } from '@/molecules/OnboardingLayout/OnboardingLayout';
import { useToast } from '@/molecules/Toaster/use-toast';
import { HumanInviteCode } from '@/organisms/HumanInviteCode/HumanInviteCode';
import type { InviteCodeVerificationResult } from '@/organisms/HumanInviteCode/HumanInviteCode.types';
import { HumanLightningPayment } from '@/organisms/HumanLightningPayment/HumanLightningPayment';
import { HumanPhoneCode } from '@/organisms/HumanPhoneCode/HumanPhoneCode';
import { HumanPhoneInput } from '@/organisms/HumanPhoneInput/HumanPhoneInput';
import { HumanSelection } from '@/organisms/HumanSelection/HumanSelection';
import { useOnboardingStore } from '@/stores/onboarding/onboarding.store';

enum States {
  Selection = 'selection',
  PhoneInput = 'phoneInput',
  PhoneCode = 'phoneCode',
  Payment = 'payment',
  InviteCode = 'inviteCode',
}

export function Human() {
  const [state, setState] = useState<States>(States.Selection);
  const [phoneNumber, setPhoneNumber] = useState<string>('');
  const { setInviteCode, reset } = useOnboardingStore();
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations('onboarding.install');

  useEffect(() => {
    reset();
  }, [reset]);

  // After payment/SMS verification, save the invite code and redirect to install page.
  // Signup to the homeserver happens later, after the user creates their keypair
  // (browser keys on /onboarding/pubky or Pubky Ring on /onboarding/scan).
  function onSuccess(inviteCode: string) {
    setInviteCode(inviteCode);
    router.push(ONBOARDING_ROUTES.INSTALL);
  }

  // Manually entered invite codes are verified with the homeserver as soon as the full code is
  // entered. On failure we surface a toast and keep the user on this step so they can try again.
  // Invalid or used codes show an error toast; unreachable homeserver errors use a distinct error title.
  async function onInviteCodeVerify(inviteCode: string): Promise<InviteCodeVerificationResult> {
    try {
      const status = await AuthController.verifySignupToken(inviteCode);

      if (status === 'valid') {
        toast({
          title: t('inviteCodeApplied'),
        });
        return 'valid';
      }

      if (status === 'used') {
        toast({
          title: t('usedInviteCode'),
          variant: 'error',
        });
        return 'used';
      }

      toast({
        title: t('invalidInviteCode'),
        variant: 'error',
      });
      return 'invalid';
    } catch {
      toast({
        variant: 'error',
        title: t('verificationFailed'),
      });
      return 'error';
    }
  }
  return (
    <OnboardingLayout testId="human-content">
      {state === States.Selection && (
        <HumanSelection
          onClick={(card) => {
            if (card === 'sms') {
              setState(States.PhoneInput);
            } else if (card === 'payment') {
              setState(States.Payment);
            }
          }}
          onInviteCodeClick={() => setState(States.InviteCode)}
          onDevMode={async (variant) => {
            if (variant === 'inviteCode') {
              setState(States.InviteCode);
            } else if (variant === 'skip') {
              try {
                const code = await AuthController.generateSignupToken();
                await onSuccess(code);
              } catch (error) {
                Logger.error('[Human] Dev skip failed (generate token or signup):', error);
              }
            }
          }}
        />
      )}
      {state === States.PhoneInput && (
        <HumanPhoneInput
          initialPhoneNumber={phoneNumber}
          onBack={() => setState(States.Selection)}
          onCodeSent={(phoneNum) => {
            setPhoneNumber(phoneNum);
            setState(States.PhoneCode);
          }}
        />
      )}
      {state === States.PhoneCode && (
        <HumanPhoneCode phoneNumber={phoneNumber!} onBack={() => setState(States.PhoneInput)} onSuccess={onSuccess} />
      )}
      {state === States.Payment && (
        <HumanLightningPayment onBack={() => setState(States.Selection)} onSuccess={onSuccess} />
      )}
      {state === States.InviteCode && (
        <HumanInviteCode
          onBack={() => setState(States.Selection)}
          onVerify={onInviteCodeVerify}
          onSuccess={onSuccess}
        />
      )}
    </OnboardingLayout>
  );
}
