'use client';

import { useSignOut } from '@/hooks/useSignOut/useSignOut';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { SettingsDivider } from '@/molecules/Settings/SettingsDivider/SettingsDivider';
import { SettingsSection } from '@/molecules/Settings/SettingsSection/SettingsSection';
import { SettingsSectionCard } from '@/molecules/Settings/SettingsSectionCard/SettingsSectionCard';
import { DialogDeleteAccount } from '@/organisms/Settings/DialogDeleteAccount/DialogDeleteAccount';

import { SETTINGS_ROUTES } from '@/app/routes';
import { UserRound, LogOut, Pencil, LockKeyhole, Trash2 } from 'lucide-react';

export function Account() {
  const router = useRouter();
  const t = useTranslations('settings.account');
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
      <SettingsSectionCard icon={UserRound} title={t('title')}>
        <SettingsSection
          title={t('signOut.title')}
          description={t('signOut.description')}
          buttonText={loadingSignOut ? t('signOut.buttonLoading') : t('signOut.button')}
          buttonIcon={LogOut}
          buttonId="sign-out-btn"
          buttonDisabled={loadingSignOut}
          buttonOnClick={handleSignOut}
        />

        <SettingsDivider />

        <SettingsSection
          title={t('editProfile.title')}
          description={t('editProfile.description')}
          buttonText={t('editProfile.button')}
          buttonIcon={Pencil}
          buttonId="edit-profile-btn"
          buttonOnClick={handleEditProfile}
        />

        <SettingsDivider />

        <SettingsSection
          title={t('backup.title')}
          description={disposableAccount ? t('backup.descriptionNeeded') : t('backup.descriptionDone')}
          buttonText={t('backup.button')}
          buttonIcon={LockKeyhole}
          buttonId="backup-account-btn"
          buttonDisabled={!disposableAccount}
          buttonOnClick={() => {}}
        />

        <SettingsDivider />

        <SettingsSection
          title={t('deleteAccount.title')}
          description={t('deleteAccount.description')}
          buttonText={t('deleteAccount.button')}
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
