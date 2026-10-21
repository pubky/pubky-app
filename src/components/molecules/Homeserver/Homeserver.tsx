'use client';

import { useRouter } from 'next/navigation';
import { LEGAL_ROUTES, ONBOARDING_ROUTES } from '@/app/routes';
import { FooterLinks } from '@/atoms/FooterLinks/FooterLinks';
import { Link } from '@/atoms/Link/Link';
import { PageHeader } from '@/atoms/PageHeader/PageHeader';
import { PageSubtitle } from '@/atoms/PageSubtitle/PageSubtitle';
import { DialogAge } from '@/organisms/DialogAge/DialogAge';
import { ButtonsNavigation } from '../ButtonsNavigation/ButtonsNavigation';
import { PageTitle } from '../Page/Page';

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
    <FooterLinks className="[&_a]:no-underline">
      By creating an account on the Pubky homeserver, you agree to the{' '}
      <Link href={LEGAL_ROUTES.TERMS_OF_USE} target="_blank">
        {'Terms of Service'}
      </Link>
      ,
      <Link href={LEGAL_ROUTES.PRIVACY_POLICY} target="_blank">
        {'Privacy Policy'}
      </Link>
      , and you confirm that you are
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
