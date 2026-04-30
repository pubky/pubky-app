import { EditProfile } from '@/templates/Settings/EditProfile/EditProfile';
import { Metadata } from '@/molecules/Metadata/Metadata';

export const metadata = Metadata({
  title: 'Edit Profile - Settings',
  description: 'Edit your profile on pubky app.',
});

export default function SettingsEditPage() {
  return <EditProfile />;
}
