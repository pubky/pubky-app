import { Metadata } from '@/molecules/Metadata/Metadata';
import { FollowBestMatches } from '@/templates/Onboarding/FollowBestMatches/FollowBestMatches';

export const metadata = Metadata({
  title: 'Follow Your Best Matches - Onboarding',
  description: 'Onboarding follow your best matches page on pubky app.',
});

export default function FollowPage() {
  return <FollowBestMatches />;
}
