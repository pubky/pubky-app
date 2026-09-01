import { OnboardingLayout } from '@/molecules/OnboardingLayout/OnboardingLayout';
import { EditProfileForm } from '@/organisms/Settings/EditProfileForm/EditProfileForm';
import { EditProfileHeader } from '@/organisms/Settings/EditProfileHeader/EditProfileHeader';

export function EditProfile() {
  return (
    // Sibling settings pages get a 16px mobile gutter from ContentLayout;
    // override OnboardingLayout's 24px (kept for the onboarding flows) to match.
    <OnboardingLayout testId="edit-profile-content" className="px-4 lg:px-6">
      <EditProfileHeader />
      <EditProfileForm />
    </OnboardingLayout>
  );
}
