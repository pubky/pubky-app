'use client';

import * as Molecules from '@/molecules';
import * as Organisms from '@/organisms';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ONBOARDING_ROUTES } from '@/app';
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
    <Molecules.OnboardingLayout testId="human-content">
      {state === States.Selection && (
        <Organisms.HumanSelection
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
        <Organisms.HumanPhoneInput
          initialPhoneNumber={phoneNumber}
          onBack={() => setState(States.Selection)}
          onCodeSent={(phoneNum) => {
            setPhoneNumber(phoneNum);
            setState(States.PhoneCode);
          }}
        />
      )}
      {state === States.PhoneCode && (
        <Organisms.HumanPhoneCode
          phoneNumber={phoneNumber!}
          onBack={() => setState(States.PhoneInput)}
          onSuccess={onSuccess}
        />
      )}
      {state === States.Payment && (
        <Organisms.HumanLightningPayment onBack={() => setState(States.Selection)} onSuccess={onSuccess} />
      )}
      {state === States.InviteCode && (
        <Organisms.HumanInviteCode onBack={() => setState(States.Selection)} onSuccess={onSuccess} />
      )}
    </Molecules.OnboardingLayout>
  );
}
