'use client';
import { OnboardingLayout } from '@/molecules/OnboardingLayout/OnboardingLayout';
import { HumanInviteCode } from '@/organisms/HumanInviteCode/HumanInviteCode';
import { HumanLightningPayment } from '@/organisms/HumanLightningPayment/HumanLightningPayment';
import { HumanPhoneCode } from '@/organisms/HumanPhoneCode/HumanPhoneCode';
import { HumanPhoneInput } from '@/organisms/HumanPhoneInput/HumanPhoneInput';
import { HumanSelection } from '@/organisms/HumanSelection/HumanSelection';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ONBOARDING_ROUTES } from '@/app/routes';
import { Logger } from '@/libs/logger/logger';
import { AuthController } from '@/controllers/auth/auth';
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
        <HumanInviteCode onBack={() => setState(States.Selection)} onSuccess={onSuccess} />
      )}
    </OnboardingLayout>
  );
}
