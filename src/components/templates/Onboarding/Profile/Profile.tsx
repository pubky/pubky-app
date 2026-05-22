import { OnboardingLayout } from '@/molecules/OnboardingLayout/OnboardingLayout';
import { CreateProfileForm } from '@/organisms/CreateProfileForm/CreateProfileForm';
import { CreateProfileHeader } from '@/organisms/CreateProfileHeader/CreateProfileHeader';

export function Profile() {
  return (
    <OnboardingLayout testId="profile-content">
      <CreateProfileHeader />
      <CreateProfileForm />
    </OnboardingLayout>
  );
}
