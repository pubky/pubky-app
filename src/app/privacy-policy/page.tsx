import { LEGAL_ROUTES } from '@/app/routes';
import { Metadata } from '@/molecules/Metadata/Metadata';
import { PrivacyPolicy } from '@/organisms/PrivacyPolicy/PrivacyPolicy';
import { LegalPage } from '@/templates/Public/LegalPage/LegalPage';

export function generateMetadata() {
  return Metadata({
    title: 'Privacy Policy - Pubky App',
    description: 'How Synonym collects, uses, shares and protects your personal information on the Pubky platform.',
    url: LEGAL_ROUTES.PRIVACY_POLICY,
  });
}

/** Public: reachable signed out and never redirected (`PUBLIC_ROUTES`). */
export default function PrivacyPolicyPage() {
  return (
    <LegalPage>
      <PrivacyPolicy />
    </LegalPage>
  );
}
