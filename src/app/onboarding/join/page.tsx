import { Metadata } from '@/molecules/Metadata/Metadata';
import { Join } from '@/templates/Onboarding/Join/Join';

export const metadata = Metadata({
  title: 'Join - Onboarding',
  description: 'Choose how to create your pubky on pubky app.',
});

export default function JoinPage() {
  return <Join />;
}
