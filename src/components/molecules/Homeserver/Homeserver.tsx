'use client';

import { useRouter } from 'next/navigation';
import { ButtonsNavigation } from '../ButtonsNavigation/ButtonsNavigation';
import { PageTitle } from '../Page/Page';
import { DialogAge } from '@/organisms/DialogAge/DialogAge';
import { DialogPrivacy } from '@/organisms/DialogPrivacy/DialogPrivacy';
import { DialogTerms } from '@/organisms/DialogTerms/DialogTerms';
import { FooterLinks } from '@/atoms/FooterLinks/FooterLinks';
import { PageHeader } from '@/atoms/PageHeader/PageHeader';
import { PageSubtitle } from '@/atoms/PageSubtitle/PageSubtitle';

import { ONBOARDING_ROUTES } from '@/app/routes';

export const HomeserverHeader = () => {
  return (
    <PageHeader>
      <PageTitle size="large">
        Choose <span className="text-brand">homeserver.</span>
      </PageTitle>
      <PageSubtitle>Enter your invite code to access the Pubky homeserver. </PageSubtitle>
    </PageHeader>
  );
};

export const HomeserverFooter = () => {
  return (
    <FooterLinks>
      By creating an account on the Pubky homeserver, you agree to the <DialogTerms />,
      <DialogPrivacy />, and you confirm that you are
      <DialogAge />
    </FooterLinks>
  );
};

export const HomeserverNavigation = ({
  continueButtonDisabled,
  onHandleContinueButton,
  continueText,
}: {
  continueButtonDisabled: boolean;
  onHandleContinueButton: () => void;
  continueText: string;
}) => {
  const router = useRouter();

  const onHandleBackButton = () => {
    router.push(ONBOARDING_ROUTES.BACKUP);
  };

  return (
    <ButtonsNavigation
      id="homeserver-navigation"
      onHandleBackButton={onHandleBackButton}
      onHandleContinueButton={onHandleContinueButton}
      continueButtonDisabled={continueButtonDisabled}
      continueText={continueText}
    />
  );
};
