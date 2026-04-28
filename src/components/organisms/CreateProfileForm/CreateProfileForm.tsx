'use client';

import { useProfileForm } from '@/hooks/useProfileForm/useProfileForm';
import * as Molecules from '@/molecules';
import * as Organisms from '@/organisms';
import * as Atoms from '@/atoms';
import * as Core from '@/core';
import * as Config from '@/config';
import { useTranslations } from 'next-intl';
import { Trash2, File } from 'lucide-react';
import { extractInitials } from '@/libs/utils/utils';

export const CreateProfileForm = () => {
  const t = useTranslations('forms.profile');
  const tCommon = useTranslations('common');
  const { setShowWelcomeDialog } = Core.useOnboardingStore();
  const authStore = Core.useAuthStore();
  const pubky = authStore.selectCurrentUserPubky();
  const { state, errors, handlers, cropDialog, fileInputRef, isSubmitDisabled } = useProfileForm({
    mode: 'create',
    pubky,
    setShowWelcomeDialog,
  });
  const avatarFallbackSeed = pubky || state.name || 'user';
  const avatarFallbackInitial =
    extractInitials({
      name: state.name,
      maxLength: 1,
    }) ||
    avatarFallbackSeed.charAt(0).toUpperCase() ||
    'U';
  return (
    <>
      <Atoms.Container className="flex w-full flex-1 flex-col gap-6 lg:flex-none" data-testid="create-profile-form">
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
                    placeholder={link.label.toUpperCase().includes('TWITTER') ? '@user' : 'https://'}
                    value={link.url}
                    variant="dashed"
                    onChange={(e) => {
                      const value = e.target.value;
                      handlers.setLinks(
                        state.links.map((l, i) =>
                          i === index
                            ? {
                                ...l,
                                url: value,
                              }
                            : l,
                        ),
                      );
                      handlers.validateLinkUrl(value, index);
                    }}
                    icon={<Trash2 className="h-4 w-4" />}
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
                  handlers.setLinks([
                    ...state.links,
                    {
                      label,
                      url,
                    },
                  ]);
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
                      state.avatarFile
                        ? t('avatarPreview', {
                            filename: state.avatarFile.name,
                          })
                        : t('avatarPreviewDefault')
                    }
                  />
                ) : (
                  <Atoms.AvatarFallback className="overflow-hidden border-none text-4xl">
                    <Molecules.FacehashAvatar seed={avatarFallbackSeed} initial={avatarFallbackInitial} />
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
                    <Trash2 className="h-4 w-4" />
                    <span>{tCommon('delete')}</span>
                  </>
                ) : (
                  <>
                    <File className="h-4 w-4" />
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
        <Molecules.ProfileNavigation
          className="onboarding-nav mt-auto lg:pt-0"
          hiddenBackButton={true}
          continueButtonDisabled={isSubmitDisabled}
          continueButtonLoading={state.isSaving}
          continueText={t(state.submitTextKey)}
          onContinue={handlers.handleSubmit}
        />
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
