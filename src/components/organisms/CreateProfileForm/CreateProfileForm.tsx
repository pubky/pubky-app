'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { File, Trash2 } from 'lucide-react';
import { ONBOARDING_ROUTES } from '@/app/routes';
import { Avatar, AvatarFallback, AvatarImage } from '@/atoms/Avatar/Avatar';
import { Button } from '@/atoms/Button/Button';
import { Card } from '@/atoms/Card/Card';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { Label } from '@/atoms/Label/Label';
import { Typography } from '@/atoms/Typography/Typography';
import { USER_MAX_LINKS } from '@/config/user';
import { useCurrentUserProfile } from '@/hooks/useCurrentUserProfile/useCurrentUserProfile';
import { useProfileForm } from '@/hooks/useProfileForm/useProfileForm';
import { extractInitials } from '@/libs/utils/utils';
import { FacehashAvatar } from '@/molecules/FacehashAvatar/FacehashAvatar';
import { InputField } from '@/molecules/InputField/InputField';
import { ProfileNavigation } from '@/molecules/ProfileNavigation/ProfileNavigation';
import { TextareaField } from '@/molecules/TextareaField/TextareaField';
import { ProfileFormSkeleton } from '@/organisms/ProfileFormSkeleton/ProfileFormSkeleton';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useOnboardingStore } from '@/stores/onboarding/onboarding.store';
import { DialogAddLink } from '../DialogAddLink/DialogAddLink';
import { DialogCropImage } from '../DialogCropImage/DialogCropImage';

export const CreateProfileForm = () => {
  const router = useRouter();
  const { setShowWelcomeDialog } = useOnboardingStore();
  const authStore = useAuthStore();
  const pubky = authStore.selectCurrentUserPubky();
  // Frozen at mount: a user with a profile is revisiting this step (Back from the tags step),
  // so the form must edit, not re-create. hasProfile flips true mid-create-submit
  // (bootstrapWithDelay), and freezing prevents the form from remounting as an editor then.
  const [isRevisit] = useState(() => useAuthStore.getState().hasProfile === true);
  const { userDetails } = useCurrentUserProfile({ enabled: isRevisit });
  const { state, errors, handlers, cropDialog, fileInputRef, isSubmitDisabled } = useProfileForm(
    isRevisit
      ? { mode: 'edit', pubky, userDetails, redirectTo: ONBOARDING_ROUTES.TAGS }
      : { mode: 'create', pubky, setShowWelcomeDialog },
  );
  const avatarFallbackSeed = pubky || state.name || 'user';
  const avatarFallbackInitial =
    extractInitials({
      name: state.name,
      maxLength: 1,
    }) ||
    avatarFallbackSeed.charAt(0).toUpperCase() ||
    'U';
  // Revisit mode only: isLoading stays true until the current profile hydrates the form.
  // Rendering the interactive form before then would let edits (text, avatar file) be
  // silently overwritten or resurface once hydration lands, so show the skeleton instead.
  if (state.isLoading) {
    return <ProfileFormSkeleton />;
  }
  return (
    <>
      <Container className="flex w-full flex-1 flex-col gap-6 lg:flex-none" data-testid="create-profile-form">
        <Card className="rounded-md bg-card p-6 md:p-12 lg:flex lg:flex-row lg:gap-12">
          {/* Profile Section */}
          <Container className="w-full gap-6">
            <Container className="gap-3">
              <Heading level={3} size="xl" className="text-2xl">
                {'Profile'}
              </Heading>
            </Container>

            <Container className="gap-6">
              <Container className="gap-2">
                <Label className="text-xs font-medium tracking-wide text-muted-foreground">{'NAME*'}</Label>
                <InputField
                  id="profile-name-input"
                  placeholder={'Enter your name'}
                  variant="dashed"
                  value={state.name}
                  onChange={(e) => handlers.setName(e.target.value)}
                  status={errors.nameError ? 'error' : 'default'}
                  message={errors.nameError ?? undefined}
                  messageType={errors.nameError ? 'error' : 'default'}
                />
              </Container>

              <Container className="gap-2">
                <Label className="text-xs font-medium tracking-wide text-muted-foreground">{'BIO'}</Label>
                <TextareaField
                  id="profile-bio-input"
                  placeholder={'Tell a bit about yourself.'}
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
                {'Links'}
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
                {'Avatar'}
              </Heading>
            </Container>

            <Container className="flex-row justify-center">
              <Avatar
                key={state.avatarPreview ? 'with-image' : 'without-image'}
                className="h-48 w-48 cursor-pointer bg-muted"
                onClick={handlers.handleChooseFileClick}
                role="button"
                aria-label={'Choose avatar image'}
              >
                {state.avatarPreview ? (
                  <AvatarImage
                    src={state.avatarPreview}
                    alt={
                      state.avatarFile ? `Selected avatar preview: ${state.avatarFile.name}` : 'Selected avatar preview'
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
                    <span>{'Delete'}</span>
                  </>
                ) : (
                  <>
                    <File className="h-4 w-4" />
                    <span>{'Choose file'}</span>
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
        <ProfileNavigation
          className="onboarding-nav mt-auto flex-col sm:flex-row lg:pt-0"
          backButtonDisabled={!isRevisit}
          onHandleBackButton={isRevisit ? () => router.push(ONBOARDING_ROUTES.TAGS) : undefined}
          continueButtonDisabled={isSubmitDisabled}
          continueButtonLoading={state.isSaving}
          continueText={state.submitText}
          onContinue={handlers.handleSubmit}
        />
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
