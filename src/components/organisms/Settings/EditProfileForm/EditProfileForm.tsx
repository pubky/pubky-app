'use client';

import { useCurrentUserProfile } from '@/hooks/useCurrentUserProfile/useCurrentUserProfile';
import { useProfileForm } from '@/hooks/useProfileForm/useProfileForm';
import { FacehashAvatar } from '@/molecules/FacehashAvatar/FacehashAvatar';
import { InputField } from '@/molecules/InputField/InputField';
import { TextareaField } from '@/molecules/TextareaField/TextareaField';
import { DialogAddLink } from '../../DialogAddLink/DialogAddLink';
import { DialogCropImage } from '../../DialogCropImage/DialogCropImage';
import { Avatar, AvatarFallback, AvatarImage } from '@/atoms/Avatar/Avatar';
import { Button } from '@/atoms/Button/Button';
import { Card } from '@/atoms/Card/Card';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { Label } from '@/atoms/Label/Label';
import { Spinner } from '@/atoms/Spinner/Spinner';
import { Typography } from '@/atoms/Typography/Typography';

import { USER_MAX_LINKS } from '@/config/user';
import { useTranslations } from 'next-intl';
import { EditProfileFormSkeleton } from './EditProfileForm.skeleton';
import { Trash2, File } from 'lucide-react';
import { extractInitials } from '@/libs/utils/utils';

export const EditProfileForm = () => {
  const t = useTranslations('forms.profile');
  const tCommon = useTranslations('common');
  const { userDetails, currentUserPubky } = useCurrentUserProfile();
  const { state, errors, handlers, cropDialog, fileInputRef, isSubmitDisabled } = useProfileForm({
    mode: 'edit',
    pubky: currentUserPubky,
    userDetails,
  });
  const avatarFallbackSeed = currentUserPubky || state.name || 'user';
  const avatarFallbackInitial =
    extractInitials({
      name: state.name,
      maxLength: 1,
    }) ||
    avatarFallbackSeed.charAt(0).toUpperCase() ||
    'U';
  if (state.isLoading) {
    return <EditProfileFormSkeleton />;
  }
  return (
    <>
      <Container className="flex w-full flex-1 flex-col gap-6 lg:flex-none" data-testid="edit-profile-form">
        <Card className="rounded-md bg-card p-6 md:p-12 lg:flex lg:flex-row lg:gap-12">
          {/* Profile Section */}
          <Container className="w-full gap-6">
            <Container className="gap-3">
              <Heading level={3} size="xl" className="text-2xl">
                {tCommon('profile')}
              </Heading>
            </Container>

            <Container className="gap-6">
              <Container className="gap-2">
                <Label className="text-xs font-medium tracking-wide text-muted-foreground">{t('name')}</Label>
                <InputField
                  id="profile-name-input"
                  placeholder={t('namePlaceholder')}
                  variant="dashed"
                  value={state.name}
                  onChange={(e) => handlers.setName(e.target.value)}
                  status={errors.nameError ? 'error' : 'default'}
                  message={errors.nameError ?? undefined}
                  messageType={errors.nameError ? 'error' : 'default'}
                />
              </Container>

              <Container className="gap-2">
                <Label className="text-xs font-medium tracking-wide text-muted-foreground">{t('bio')}</Label>
                <TextareaField
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
              </Container>
            </Container>
          </Container>

          {/* Links Section */}
          <Container className="mt-6 w-full gap-6 lg:mt-0">
            <Container className="gap-3">
              <Heading level={3} size="xl" className="text-2xl">
                {t('linksTitle')}
              </Heading>
            </Container>

            <Container className="gap-6">
              {state.links.map((link, index) => (
                <Container className="gap-2" key={`${link.label}-${index}`}>
                  <Label className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    {link.label}
                  </Label>
                  <InputField
                    id={`profile-links-input-${index}`}
                    dataCy={`edit-profile-link-${link.label.toLowerCase()}-input`}
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
                </Container>
              ))}

              <DialogAddLink
                onSave={(label, url) => {
                  handlers.setLinks([
                    ...state.links,
                    {
                      label,
                      url,
                    },
                  ]);
                }}
                disabled={state.links.length >= USER_MAX_LINKS}
              />
            </Container>
          </Container>

          {/* Avatar Section */}
          <Container className="mt-6 w-full gap-6 lg:mt-0">
            <Container className="gap-3 md:text-center">
              <Heading level={3} size="xl" className="text-2xl">
                {t('avatarTitle')}
              </Heading>
            </Container>

            <Container className="flex-row justify-center">
              <Avatar
                key={state.avatarPreview ? 'with-image' : 'without-image'}
                className="h-48 w-48 cursor-pointer bg-muted"
                onClick={handlers.handleChooseFileClick}
                role="button"
                aria-label={t('chooseAvatar')}
              >
                {state.avatarPreview ? (
                  <AvatarImage
                    src={state.avatarPreview}
                    alt={
                      state.avatarFile
                        ? t('avatarPreview', {
                            filename: state.avatarFile.name,
                          })
                        : t('currentAvatar')
                    }
                  />
                ) : (
                  <AvatarFallback className="overflow-hidden border-none text-4xl">
                    <FacehashAvatar seed={avatarFallbackSeed} initial={avatarFallbackInitial} />
                  </AvatarFallback>
                )}
              </Avatar>
            </Container>

            <Container className="justify-center">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlers.handleFileChange}
              />
              <Button
                variant="secondary"
                size="sm"
                className="mx-auto rounded-full"
                onClick={state.avatarPreview ? handlers.handleDeleteAvatar : handlers.handleChooseFileClick}
              >
                {state.avatarPreview ? (
                  <>
                    <Trash2 className="h-4 w-4" />
                    <Typography as="span" overrideDefaults>
                      {tCommon('delete')}
                    </Typography>
                  </>
                ) : (
                  <>
                    <File className="h-4 w-4" />
                    <Typography as="span" overrideDefaults>
                      {t('chooseFile')}
                    </Typography>
                  </>
                )}
              </Button>
              {errors.avatarError && (
                <Typography as="small" size="sm" className="ml-1 text-red-500">
                  {errors.avatarError}
                </Typography>
              )}
            </Container>
          </Container>
        </Card>

        {/* Navigation Buttons */}
        <Container className="mt-auto flex-row justify-between">
          <Button
            variant="outline"
            size="lg"
            onClick={handlers.handleCancel}
            disabled={state.isSaving}
            className="rounded-full px-8"
            data-cy="edit-profile-cancel-btn"
          >
            {tCommon('cancel')}
          </Button>
          <Button
            size="lg"
            onClick={handlers.handleSubmit}
            disabled={isSubmitDisabled}
            data-testid="save-profile-button"
            data-cy="edit-profile-save-btn"
            className="rounded-full px-8"
          >
            {state.isSaving && <Spinner size="sm" className="mr-2" />}
            {t(state.submitTextKey)}
          </Button>
        </Container>
      </Container>

      <DialogCropImage
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
