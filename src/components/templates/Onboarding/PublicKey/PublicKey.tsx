import { OnboardingLayout } from '@/molecules/OnboardingLayout/OnboardingLayout';
import { PublicKeyHeader, PublicKeyNavigation } from '@/molecules/PublicKey/Pubkey';
import { PublicKeyCard } from '@/organisms/PublicKeyCard/PublicKeyCard';

export function PublicKey() {
  return (
    <OnboardingLayout testId="public-key-content" navigation={<PublicKeyNavigation />}>
      <PublicKeyHeader />
      <PublicKeyCard />
    </OnboardingLayout>
  );
}
