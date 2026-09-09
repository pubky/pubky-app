import { Metadata } from '@/molecules/Metadata/Metadata';
import { Profile } from '@/templates/Onboarding/Profile/Profile';

export const metadata = Metadata({
  title: 'Profile - Onboarding',
  description: 'Onboarding profile page on pubky app.',
});

export default function ProfilePage() {
  return <Profile />;
}
