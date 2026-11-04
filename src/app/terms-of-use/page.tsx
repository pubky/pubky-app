import { LEGAL_ROUTES } from '@/app/routes';
import { Metadata } from '@/molecules/Metadata/Metadata';
import { TermsOfService } from '@/organisms/TermsOfService/TermsOfService';
import { LegalPage } from '@/templates/Public/LegalPage/LegalPage';

export function generateMetadata() {
  return Metadata({
    title: 'Terms of Service - Pubky App',
    description: 'The terms and conditions that govern your access to and use of the Pubky platform and the Pubky App.',
    url: LEGAL_ROUTES.TERMS_OF_USE,
  });
}

/** Public: reachable signed out and never redirected (`PUBLIC_ROUTES`). */
export default function TermsOfUsePage() {
  return (
    <LegalPage>
      <TermsOfService />
    </LegalPage>
  );
}
