'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as Molecules from '@/molecules';
import * as Organisms from '@/organisms';
import * as Hooks from '@/hooks';
import * as App from '@/app';
import { UserRound, LogOut, Pencil, LockKeyhole, Trash2 } from 'lucide-react';
export function Account() {
  const router = useRouter();
  const t = useTranslations('settings.account');
  const { handleSignOut, isLoading: loadingSignOut } = Hooks.useSignOut();
  const [disposableAccount] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const handleOpenDeleteDialog = () => {
    setShowDeleteDialog(true);
  };
  const handleEditProfile = () => {
    router.push(App.SETTINGS_ROUTES.EDIT);
  };
  return (
    <>
      <Molecules.SettingsSectionCard icon={UserRound} title={t('title')}>
        <Molecules.SettingsSection
          title={t('signOut.title')}
          description={t('signOut.description')}
          buttonText={loadingSignOut ? t('signOut.buttonLoading') : t('signOut.button')}
          buttonIcon={LogOut}
          buttonId="sign-out-btn"
          buttonDisabled={loadingSignOut}
          buttonOnClick={handleSignOut}
        />

        <Molecules.SettingsDivider />

        <Molecules.SettingsSection
          title={t('editProfile.title')}
          description={t('editProfile.description')}
          buttonText={t('editProfile.button')}
          buttonIcon={Pencil}
          buttonId="edit-profile-btn"
          buttonOnClick={handleEditProfile}
        />

        <Molecules.SettingsDivider />

        <Molecules.SettingsSection
          title={t('backup.title')}
          description={disposableAccount ? t('backup.descriptionNeeded') : t('backup.descriptionDone')}
          buttonText={t('backup.button')}
          buttonIcon={LockKeyhole}
          buttonId="backup-account-btn"
          buttonDisabled={!disposableAccount}
          buttonOnClick={() => {}}
        />

        <Molecules.SettingsDivider />

        <Molecules.SettingsSection
          title={t('deleteAccount.title')}
          description={t('deleteAccount.description')}
          buttonText={t('deleteAccount.button')}
          buttonIcon={Trash2}
          buttonId="delete-account-btn"
          buttonVariant="destructive"
          buttonOnClick={handleOpenDeleteDialog}
        />
      </Molecules.SettingsSectionCard>

      <Organisms.DialogDeleteAccount isOpen={showDeleteDialog} onOpenChangeAction={setShowDeleteDialog} />
    </>
  );
}
