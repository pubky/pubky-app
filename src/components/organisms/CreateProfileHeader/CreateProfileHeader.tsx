'use client';

import { useTranslations } from 'next-intl';
import * as Molecules from '@/molecules';
import * as Atoms from '@/atoms';
import * as Core from '@/core';
import * as Hooks from '@/hooks';
import { Key } from 'lucide-react';
import { formatPublicKey, withPubkyPrefix } from '@/libs/utils/utils';
export const CreateProfileHeader = () => {
  const t = useTranslations('onboarding.createProfile');
  const authStore = Core.useAuthStore();
  const pubky = authStore.selectCurrentUserPubky();
  const { copyToClipboard } = Hooks.useCopyToClipboard();
  const displayPublicKey = formatPublicKey({
    key: pubky,
  });
  const handleCopyToClipboard = () => {
    copyToClipboard(withPubkyPrefix(pubky));
  };
  return (
    <Atoms.PageHeader>
      <Molecules.PageTitle size="large">
        {t.rich('title', {
          highlight: (chunks) => <span className="text-brand">{chunks}</span>,
        })}
      </Molecules.PageTitle>
      <Atoms.Container className="m-0 w-auto flex-col gap-4 md:flex-row md:items-center">
        <Atoms.PageSubtitle>{t('subtitle')}</Atoms.PageSubtitle>
        <Atoms.Container className="mx-0 w-auto flex-row items-center gap-2">
          <Atoms.Button
            variant="secondary"
            className="h-8 w-fit gap-2 rounded-full uppercase"
            onClick={handleCopyToClipboard}
          >
            <Key className="h-4 w-4" />
            {displayPublicKey || '...'}
          </Atoms.Button>
          <Molecules.PopoverPublicKey className="-ml-1" />
        </Atoms.Container>
      </Atoms.Container>
    </Atoms.PageHeader>
  );
};
