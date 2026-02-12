'use client';

import * as Molecules from '@/molecules';
import * as Organisms from '@/organisms';
import * as Libs from '@/libs';
import * as Atoms from '@/atoms';
import * as Hooks from '@/hooks';
import * as Config from '@/config';
import { useTranslations } from 'next-intl';

export const EditProfileForm = () => {
  const t = useTranslations('forms.profile');
  const tCommon = useTranslations('common');
  const { userDetails, currentUserPubky } = Hooks.useCurrentUserProfile();

  const { state, errors, handlers, cropDialog, fileInputRef, isSubmitDisabled } = Hooks.useProfileForm({
    mode: 'edit',
    pubky: currentUserPubky,
    userDetails,
  });

  if (state.isLoading) {
    return (
      <Atoms.Container className="flex w-full flex-1 flex-col items-center justify-center gap-6">
        <Atoms.Spinner size="lg" />
        <Atoms.Typography>{t('loading')}</Atoms.Typography>
      </Atoms.Container>
    );
  }

  return (
    <>
      <Atoms.Container className="flex w-full flex-1 flex-col gap-6 lg:flex-none" data-testid="edit-profile-form">
        <Atoms.Card className="rounded-md bg-card p-6 md:p-12 lg:flex lg:flex-row lg:gap-12">
          {/* Profile Section */}
          <Atoms.Container className="w-full gap-6">
            <Atoms.Container className="gap-3">
              <Atoms.Heading level={3} size="xl" className="text-2xl">
                {tCommon('profile')}
              </Atoms.Heading>
            </Atoms.Container>

            <Atoms.Container className="gap-6">
              <Atoms.Container className="gap-2">
                <Atoms.Label className="text-xs font-medium tracking-wide text-muted-foreground">
                  {t('name')}
                </Atoms.Label>
                <Molecules.InputField
                  id="profile-name-input"
                  placeholder={t('namePlaceholder')}
                  variant="dashed"
                  value={state.name}
                  onChange={(e) => handlers.setName(e.target.value)}
                  status={errors.nameError ? 'error' : 'default'}
                  message={errors.nameError ?? undefined}
                  messageType={errors.nameError ? 'error' : 'default'}
                />
              </Atoms.Container>

              <Atoms.Container className="gap-2">
                <Atoms.Label className="text-xs font-medium tracking-wide text-muted-foreground">
                  {t('bio')}
                </Atoms.Label>
                <Molecules.TextareaField
                  id="profile-bio-input"
                  placeholder={t('bioPlaceholder')}
                  value={state.bio}
                  variant="dashed"
                  rows={40}
                  onChange={(e) => handlers.setBio(e.target.value)}
                  status={errors.bioError ? 'error' : 'default'}
                  message={errors.bioError ?? undefined}
                  messageType={errors.bioError ? 'error' : 'default'}
                />
              </Atoms.Container>
            </Atoms.Container>
          </Atoms.Container>

          {/* Links Section */}
          <Atoms.Container className="mt-6 w-full gap-6 lg:mt-0">
            <Atoms.Container className="gap-3">
              <Atoms.Heading level={3} size="xl" className="text-2xl">
                {t('linksTitle')}
              </Atoms.Heading>
            </Atoms.Container>

            <Atoms.Container className="gap-6">
              {state.links.map((link, index) => (
                <Atoms.Container className="gap-2" key={`${link.label}-${index}`}>
                  <Atoms.Label className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    {link.label}
                  </Atoms.Label>
                  <Molecules.InputField
                    id={`profile-links-input-${index}`}
                    dataCy={`edit-profile-link-${link.label.toLowerCase()}-input`}
                    placeholder={link.label.toUpperCase().includes('TWITTER') ? '@user' : 'https://'}
                    value={link.url}
                    variant="dashed"
                    onChange={(e) => {
                      const value = e.target.value;
                      handlers.setLinks(state.links.map((l, i) => (i === index ? { ...l, url: value } : l)));
                      handlers.validateLinkUrl(value, index);
                    }}
                    icon={<Libs.Trash2 className="h-4 w-4" />}
                    onClickIcon={() => handlers.handleDeleteLink(index)}
                    iconPosition="right"
                    status={errors.linkUrlErrors[index] ? 'error' : 'default'}
                    message={errors.linkUrlErrors[index] ?? undefined}
                    messageType={errors.linkUrlErrors[index] ? 'error' : 'default'}
                  />
                </Atoms.Container>
              ))}

              <Organisms.DialogAddLink
                onSave={(label, url) => {
                  handlers.setLinks([...state.links, { label, url }]);
                }}
                disabled={state.links.length >= Config.USER_MAX_LINKS}
              />
            </Atoms.Container>
          </Atoms.Container>

          {/* Avatar Section */}
          <Atoms.Container className="mt-6 w-full gap-6 lg:mt-0">
            <Atoms.Container className="gap-3 md:text-center">
              <Atoms.Heading level={3} size="xl" className="text-2xl">
                {t('avatarTitle')}
              </Atoms.Heading>
            </Atoms.Container>

            <Atoms.Container className="flex-row justify-center">
              <Atoms.Avatar
                key={state.avatarPreview ? 'with-image' : 'without-image'}
                className="h-48 w-48 cursor-pointer bg-muted"
                onClick={handlers.handleChooseFileClick}
                role="button"
                aria-label={t('chooseAvatar')}
              >
                {state.avatarPreview ? (
                  <Atoms.AvatarImage
                    src={state.avatarPreview}
                    alt={
                      state.avatarFile ? t('avatarPreview', { filename: state.avatarFile.name }) : t('currentAvatar')
                    }
                  />
                ) : (
                  <Atoms.AvatarFallback className="text-4xl">
                    {state.name ? state.name.substring(0, 2).toUpperCase() : 'SN'}
                  </Atoms.AvatarFallback>
                )}
              </Atoms.Avatar>
            </Atoms.Container>

            <Atoms.Container className="justify-center">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlers.handleFileChange}
              />
              <Atoms.Button
                variant="secondary"
                size="sm"
                className="mx-auto rounded-full"
                onClick={state.avatarPreview ? handlers.handleDeleteAvatar : handlers.handleChooseFileClick}
              >
                {state.avatarPreview ? (
                  <>
                    <Libs.Trash2 className="h-4 w-4" />
                    <span>{tCommon('delete')}</span>
                  </>
                ) : (
                  <>
                    <Libs.File className="h-4 w-4" />
                    <span>{t('chooseFile')}</span>
                  </>
                )}
              </Atoms.Button>
              {errors.avatarError && (
                <Atoms.Typography as="small" size="sm" className="ml-1 text-red-500">
                  {errors.avatarError}
                </Atoms.Typography>
              )}
            </Atoms.Container>
          </Atoms.Container>
        </Atoms.Card>

        {/* Navigation Buttons */}
        <Atoms.Container className="mt-auto flex-row justify-between">
          <Atoms.Button
            variant="outline"
            size="lg"
            onClick={handlers.handleCancel}
            disabled={state.isSaving}
            className="rounded-full px-8"
            data-cy="edit-profile-cancel-btn"
          >
            {tCommon('cancel')}
          </Atoms.Button>
          <Atoms.Button
            size="lg"
            onClick={handlers.handleSubmit}
            disabled={isSubmitDisabled}
            data-testid="save-profile-button"
            data-cy="edit-profile-save-btn"
            className="rounded-full px-8"
          >
            {state.isSaving && <Atoms.Spinner size="sm" className="mr-2" />}
            {t(state.submitTextKey)}
          </Atoms.Button>
        </Atoms.Container>
      </Atoms.Container>

      <Organisms.DialogCropImage
        open={cropDialog.cropDialogOpen}
        imageSrc={cropDialog.pendingAvatarPreview}
        fileName={cropDialog.pendingAvatarFile?.name ?? 'avatar.png'}
        fileType={cropDialog.pendingAvatarFile?.type ?? 'image/png'}
        onClose={handlers.handleCropCancel}
        onBack={handlers.handleCropBack}
        onCrop={handlers.handleCropComplete}
      />
    </>
  );
};
