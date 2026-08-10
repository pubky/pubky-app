'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LockKeyhole, LogOut, Pencil, Trash2, UserRound } from 'lucide-react';
import { SETTINGS_ROUTES } from '@/app/routes';
import { useSignOut } from '@/hooks/useSignOut/useSignOut';
import { SettingsDivider } from '@/molecules/Settings/SettingsDivider/SettingsDivider';
import { SettingsSection } from '@/molecules/Settings/SettingsSection/SettingsSection';
import { SettingsSectionCard } from '@/molecules/Settings/SettingsSectionCard/SettingsSectionCard';
import { DialogDeleteAccount } from '@/organisms/Settings/DialogDeleteAccount/DialogDeleteAccount';

export function Account() {
  const router = useRouter();
  const { handleSignOut, isLoading: loadingSignOut } = useSignOut();
  const [disposableAccount] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const handleOpenDeleteDialog = () => {
    setShowDeleteDialog(true);
  };
  const handleEditProfile = () => {
    router.push(SETTINGS_ROUTES.EDIT);
  };
  return (
    <>
      <SettingsSectionCard icon={UserRound} title={'Account'}>
        <SettingsSection
          title={'Sign out from Pubky'}
          description={'Sign out to protect your account from unauthorized access.'}
          buttonText={loadingSignOut ? 'Signing out...' : 'Sign out'}
          buttonIcon={LogOut}
          buttonId="sign-out-btn"
          buttonDisabled={loadingSignOut}
          buttonOnClick={handleSignOut}
        />

        <SettingsDivider />

        <SettingsSection
          title={'Edit your profile'}
          description={'Update your bio or user picture, so friends can find you easier.'}
          buttonText={'Edit profile'}
          buttonIcon={Pencil}
          buttonId="edit-profile-btn"
          buttonOnClick={handleEditProfile}
        />

        <SettingsDivider />

        <SettingsSection
          title={'Backup your account'}
          description={
            disposableAccount
              ? 'Without a backup you lose your account if you close your browser!'
              : 'You have already completed the backup, or closed your browser before doing so. Your recovery file and seed phrase have been deleted.'
          }
          buttonText={'Back up'}
          buttonIcon={LockKeyhole}
          buttonId="backup-account-btn"
          buttonDisabled={!disposableAccount}
          buttonOnClick={() => {}}
        />

        <SettingsDivider />

        <SettingsSection
          title={'Delete your account'}
          description={
            'Deleting your account will remove all of your posts, tags, profile information, contacts, custom streams, and settings or preferences.'
          }
          buttonText={'Delete Account'}
          buttonIcon={Trash2}
          buttonId="delete-account-btn"
          buttonVariant="destructive"
          buttonOnClick={handleOpenDeleteDialog}
        />
      </SettingsSectionCard>

      <DialogDeleteAccount isOpen={showDeleteDialog} onOpenChangeAction={setShowDeleteDialog} />
    </>
  );
}
