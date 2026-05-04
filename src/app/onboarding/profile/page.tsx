import { Profile } from '@/templates/Onboarding/Profile/Profile';
import { Metadata } from '@/molecules/Metadata/Metadata';

export const metadata = Metadata({
  title: 'Profile - Onboarding',
  description: 'Onboarding profile page on pubky app.',
});

export default function ProfilePage() {
  return <Profile />;
}
