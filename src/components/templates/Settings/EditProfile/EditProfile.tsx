import { OnboardingLayout } from '@/molecules/OnboardingLayout/OnboardingLayout';
import { EditProfileForm } from '@/organisms/Settings/EditProfileForm/EditProfileForm';
import { EditProfileHeader } from '@/organisms/Settings/EditProfileHeader/EditProfileHeader';

export function EditProfile() {
  return (
    <OnboardingLayout testId="edit-profile-content">
      <EditProfileHeader />
      <EditProfileForm />
    </OnboardingLayout>
  );
}
