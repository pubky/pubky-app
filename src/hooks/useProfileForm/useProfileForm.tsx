'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { ONBOARDING_ROUTES, PROFILE_ROUTES, SETTINGS_ROUTES } from '@/app/routes';
import { USER_BIO_MAX_LENGTH, USER_NAME_MAX_LENGTH, USER_NAME_MIN_LENGTH } from '@/config/user';
import { AuthController } from '@/controllers/auth/auth';
import { FileController } from '@/controllers/file/file';
import { ProfileController } from '@/controllers/profile/profile';
import { AppError } from '@/libs/error/error';
import { isAuthError, requiresLogin } from '@/libs/error/error.utils';
import { getImageUploadSizeLimitToastMessage } from '@/libs/image/imageUploadSizeLimit';
import { Logger } from '@/libs/logger/logger';
import { safeExternalUrlSchema } from '@/libs/utils/safeExternalUrl';
import { generateRandomUsername } from '@/libs/utils/utils';
import { toast } from '@/molecules/Toaster/toast';
import { UserValidator } from '@/pipes/user/user.validator';
import type { NexusUserDetails } from '@/services/nexus/nexus.types';
import { useLocalFilesStore } from '@/stores/localFiles/localFiles.store';
import {
  PROFILE_SUBMIT_TEXT,
  type ProfileLink,
  type SubmitText,
  type UseProfileFormProps,
  type UseProfileFormReturn,
} from './useProfileForm.types';

const DEFAULT_LINKS: ProfileLink[] = [
  { label: 'WEBSITE', url: '' },
  { label: 'X (TWITTER)', url: '' },
];

const nameSchema = z
  .string()
  .trim()
  .min(USER_NAME_MIN_LENGTH, `Name must be at least ${USER_NAME_MIN_LENGTH} characters`)
  .max(USER_NAME_MAX_LENGTH, `Name must be no more than ${USER_NAME_MAX_LENGTH} characters`);
const bioSchema = z
  .string()
  .trim()
  .max(USER_BIO_MAX_LENGTH, `Bio must be no more than ${USER_BIO_MAX_LENGTH} characters`);

function getProfileFormLinks(userDetails: NexusUserDetails): ProfileLink[] {
  const formattedLinks = (userDetails.links ?? []).map((link) => ({
    label: link.title.toUpperCase(),
    url: link.url,
  }));
  return formattedLinks.length > 0 ? formattedLinks : DEFAULT_LINKS;
}

function areProfileLinksEqual(left: ProfileLink[], right: ProfileLink[]): boolean {
  return (
    left.length === right.length &&
    left.every((link, index) => link.label === right[index]?.label && link.url === right[index]?.url)
  );
}

export function useProfileForm(props: UseProfileFormProps): UseProfileFormReturn {
  const { mode, pubky } = props;
  // Extract userDetails for edit mode to avoid object reference issues in useEffect
  const userDetails = props.mode === 'edit' ? props.userDetails : undefined;
  const editRedirectTo = props.mode === 'edit' ? props.redirectTo : undefined;
  const setShowWelcomeDialog = props.mode === 'create' ? props.setShowWelcomeDialog : undefined;
  const idleSubmitText =
    mode === 'create' || editRedirectTo ? PROFILE_SUBMIT_TEXT.continue : PROFILE_SUBMIT_TEXT.saveProfile;

  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Generate a stable initial username for create mode (only generated once)
  const initialUsername = useMemo(() => (mode === 'create' ? generateRandomUsername() : ''), [mode]);

  // Form state
  const [name, setName] = useState(initialUsername);
  const [bio, setBio] = useState('');
  const [links, setLinks] = useState<ProfileLink[]>(DEFAULT_LINKS);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(mode === 'edit');
  const [submitText, setSubmitText] = useState<SubmitText>(idleSubmitText);

  // Edit mode specific state
  const [originalAvatarUrl, setOriginalAvatarUrl] = useState<string | null>(null);
  const [avatarChanged, setAvatarChanged] = useState(false);

  // Crop dialog state
  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);
  const [pendingAvatarPreview, setPendingAvatarPreview] = useState<string | null>(null);

  // Error state
  const [nameError, setNameError] = useState<string | null>(null);
  const [bioError, setBioError] = useState<string | null>(null);
  const [linkUrlErrors, setLinkUrlErrors] = useState<Record<number, string | null>>({});
  const [avatarError, setAvatarError] = useState<string | null>(null);

  // Load existing profile data (edit mode only)
  useEffect(() => {
    if (mode === 'edit' && userDetails) {
      setName(userDetails.name || '');
      setBio(userDetails.bio || '');

      // Convert links from NexusUserLink format to form format
      setLinks(getProfileFormLinks(userDetails));

      // Set avatar if exists
      // Note: We intentionally don't use the local store's blob URL here because:
      // 1. Blob URLs are ephemeral and can be revoked/invalidated
      // 2. The cleanup effect may revoke avatarPreview when unmounting
      // 3. The local store is for immediate display, not form state restoration
      if (userDetails.image && pubky) {
        let avatarUrl = FileController.getAvatarUrl(pubky, userDetails.indexed_at);
        // TODO: Has to be fixed with the ServiceWorker
        // Assign a random number (0-100000) as a query parameter to avatarUrl for cache busting
        avatarUrl = `${avatarUrl}${Math.floor(Math.random() * 100000)}`;
        setOriginalAvatarUrl(avatarUrl);
        setAvatarPreview(avatarUrl);
      }

      setIsLoading(false);
    }
  }, [mode, userDetails, pubky]);

  const isEditProfileDirty =
    mode === 'edit' &&
    userDetails !== undefined &&
    userDetails !== null &&
    (name !== (userDetails.name || '') ||
      bio !== (userDetails.bio || '') ||
      !areProfileLinksEqual(links, getProfileFormLinks(userDetails)) ||
      avatarChanged);

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      if (avatarPreview && avatarPreview.startsWith('blob:')) {
        URL.revokeObjectURL(avatarPreview);
      }
      if (pendingAvatarPreview) URL.revokeObjectURL(pendingAvatarPreview);
    };
  }, [avatarPreview, pendingAvatarPreview]);

  // Validation helpers
  const validateName = useCallback((value: string) => {
    const res = nameSchema.safeParse(value);
    setNameError(res.success ? null : (res.error.issues[0]?.message ?? 'Invalid name'));
  }, []);

  const validateBio = useCallback((value: string) => {
    if (value.trim().length === 0) {
      setBioError(null);
    } else {
      const res = bioSchema.safeParse(value);
      setBioError(res.success ? null : (res.error.issues[0]?.message ?? 'Invalid bio'));
    }
  }, []);

  const validateLinkUrl = useCallback((value: string, index: number) => {
    if (value.trim().length === 0) {
      setLinkUrlErrors((prev) => ({ ...prev, [index]: null }));
    } else {
      const res = safeExternalUrlSchema.safeParse(value);
      setLinkUrlErrors((prev) => ({
        ...prev,
        [index]: res.success ? null : (res.error.issues[0]?.message ?? 'Invalid URL'),
      }));
    }
  }, []);

  const validateUser = useCallback(() => {
    const avatarToValidate = mode === 'edit' && !avatarChanged ? null : avatarFile;
    const { data, error } = UserValidator.check(name, bio, links, avatarToValidate);

    if (error.length > 0) {
      for (const issue of error) {
        switch (issue.type) {
          case 'name':
            setNameError(issue.message);
            break;
          case 'bio':
            setBioError(issue.message);
            break;
          case 'avatar':
            setAvatarError(issue.message);
            break;
          default:
            if (issue.type.startsWith('link_')) {
              const linkIndex = parseInt(issue.type.split('_')[1], 10);
              if (!isNaN(linkIndex)) {
                setLinkUrlErrors((prev) => ({ ...prev, [linkIndex]: issue.message }));
              }
            }
            break;
        }
      }
      return;
    }

    return data;
  }, [mode, avatarChanged, avatarFile, name, bio, links]);

  // File handlers
  const handleChooseFileClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0] ?? null;
      if (!file) return;

      if (!file.type.startsWith('image/')) {
        setAvatarError('Avatar must be an image file');
        return;
      }

      if (pendingAvatarPreview) URL.revokeObjectURL(pendingAvatarPreview);

      const nextPreview = URL.createObjectURL(file);
      setPendingAvatarFile(file);
      setPendingAvatarPreview(nextPreview);
      setCropDialogOpen(true);
      setAvatarError(null);
    },
    [pendingAvatarPreview],
  );

  const resetPendingAvatar = useCallback(() => {
    if (pendingAvatarPreview) {
      URL.revokeObjectURL(pendingAvatarPreview);
    }
    setPendingAvatarFile(null);
    setPendingAvatarPreview(null);
  }, [pendingAvatarPreview]);

  const handleDeleteLink = useCallback((index: number) => {
    setLinks((prev) => prev.filter((_, i) => i !== index));
    setLinkUrlErrors({});
  }, []);

  const handleDeleteAvatar = useCallback(() => {
    if (avatarPreview && avatarPreview.startsWith('blob:')) {
      URL.revokeObjectURL(avatarPreview);
    }
    setAvatarFile(null);
    setAvatarPreview(null);
    if (mode === 'edit') {
      setAvatarChanged(true);
    }
    setAvatarError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [avatarPreview, mode]);

  const handleCropCancel = useCallback(() => {
    resetPendingAvatar();
    setCropDialogOpen(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [resetPendingAvatar]);

  const handleCropBack = useCallback(() => {
    resetPendingAvatar();
    setCropDialogOpen(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  }, [resetPendingAvatar]);

  const handleCropComplete = useCallback(
    (file: File, previewUrl: string) => {
      resetPendingAvatar();
      if (avatarPreview && avatarPreview.startsWith('blob:')) {
        URL.revokeObjectURL(avatarPreview);
      }
      setAvatarFile(file);
      setAvatarPreview(previewUrl);
      if (mode === 'edit') {
        setAvatarChanged(true);
      }
      setCropDialogOpen(false);
      setAvatarError(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [resetPendingAvatar, avatarPreview, mode],
  );

  // Submit handler
  const handleSubmit = useCallback(async () => {
    if (!pubky) return;

    if (mode === 'edit' && editRedirectTo && !isEditProfileDirty) {
      router.push(editRedirectTo);
      return;
    }

    setIsSaving(true);
    setSubmitText(PROFILE_SUBMIT_TEXT.saving);

    try {
      const user = validateUser();
      if (!user) {
        setSubmitText(idleSubmitText);
        return;
      }

      // Handle avatar upload
      let image: string | null = null;

      if (mode === 'create') {
        if (avatarFile) {
          setSubmitText(PROFILE_SUBMIT_TEXT.uploadingAvatar);
          image = await FileController.commitCreate({ file: avatarFile, pubky });
          if (!image) {
            setSubmitText(PROFILE_SUBMIT_TEXT.tryAgain);
            return;
          }
        }
      } else {
        // Edit mode
        image = originalAvatarUrl ? (userDetails?.image ?? null) : null;

        if (avatarChanged) {
          if (avatarFile) {
            setSubmitText(PROFILE_SUBMIT_TEXT.uploadingAvatar);
            const uploadedImage = await FileController.commitCreate({ file: avatarFile, pubky });
            if (!uploadedImage) {
              setSubmitText(PROFILE_SUBMIT_TEXT.tryAgain);
              return;
            }
            image = uploadedImage;
          } else {
            image = null;
          }
        }
      }

      setSubmitText(PROFILE_SUBMIT_TEXT.savingProfile);

      if (mode === 'create') {
        await ProfileController.commitCreate({ profile: user, image, pubky });
        // Store a NEW blob URL globally so all avatar components show the new avatar instantly
        // We create a separate blob URL so the form's cleanup can safely revoke its own
        if (avatarFile) {
          const globalBlobUrl = URL.createObjectURL(avatarFile);
          useLocalFilesStore.getState().setProfile(globalBlobUrl);
        }
        await AuthController.bootstrapWithDelay();
        setShowWelcomeDialog?.(true);
        router.push(ONBOARDING_ROUTES.TAGS);
      } else {
        await ProfileController.commitUpdate({
          name: user.name,
          bio: user.bio,
          links: user.links,
          image,
          pubky,
        });
        // Update local avatar store: set NEW blob URL if new avatar, clear if deleted
        // We create a separate blob URL so the form's cleanup can safely revoke its own
        if (avatarChanged) {
          if (avatarFile) {
            const globalBlobUrl = URL.createObjectURL(avatarFile);
            useLocalFilesStore.getState().setProfile(globalBlobUrl);
          } else {
            // Avatar was deleted
            useLocalFilesStore.getState().setProfile(null);
          }
        }
        toast({
          title: 'Profile updated',
        });
        router.push(editRedirectTo ?? PROFILE_ROUTES.PROFILE);
      }
    } catch (error) {
      const sizeLimitMessage = getImageUploadSizeLimitToastMessage(error);
      if (sizeLimitMessage) {
        setSubmitText(PROFILE_SUBMIT_TEXT.tryAgain);
        toast({
          variant: 'error',
          description: sizeLimitMessage,
        });
        return;
      }

      if (error instanceof AppError) {
        // Handle session expiration - user needs to re-authenticate
        if (requiresLogin(error)) {
          Logger.error('Session expired while saving profile', error);
          setSubmitText(PROFILE_SUBMIT_TEXT.tryAgain);
          toast({
            variant: 'error',
            description: 'Session expired. Please sign in.',
          });
          return;
        }

        // Handle auth errors from homeserver
        if (isAuthError(error)) {
          Logger.error('Failed to save profile in Homeserver', error);
          setSubmitText(PROFILE_SUBMIT_TEXT.tryAgain);
          toast({
            variant: 'error',
            description: 'Could not save profile',
          });
          return;
        }
      }

      setSubmitText(PROFILE_SUBMIT_TEXT.tryAgain);
      toast({
        variant: 'error',
        description: mode === 'create' ? 'Could not refresh profile' : 'Could not update profile',
      });
    } finally {
      setIsSaving(false);
    }
  }, [
    pubky,
    mode,
    validateUser,
    avatarFile,
    avatarChanged,
    originalAvatarUrl,
    userDetails,
    editRedirectTo,
    idleSubmitText,
    isEditProfileDirty,
    setShowWelcomeDialog,
    router,
  ]);

  const handleCancel = useCallback(() => {
    // Check if there's navigation history to go back to
    // history.length > 1 indicates the user has navigation history
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      // Fallback to settings account page if no history (direct URL access)
      router.push(SETTINGS_ROUTES.ACCOUNT);
    }
  }, [router]);

  // Computed values
  const isSubmitDisabled =
    !!nameError ||
    name.trim().length < USER_NAME_MIN_LENGTH ||
    !!bioError ||
    Object.values(linkUrlErrors).some((m) => !!m) ||
    !!avatarError ||
    isSaving;

  return {
    state: {
      name,
      bio,
      links,
      avatarFile,
      avatarPreview,
      isSaving,
      isLoading,
      submitText,
    },
    errors: {
      nameError,
      bioError,
      linkUrlErrors,
      avatarError,
    },
    handlers: {
      setName: (value: string) => {
        setName(value);
        validateName(value);
      },
      setBio: (value: string) => {
        setBio(value);
        validateBio(value);
      },
      setLinks,
      handleChooseFileClick,
      handleFileChange,
      handleDeleteLink,
      handleDeleteAvatar,
      handleCropCancel,
      handleCropBack,
      handleCropComplete,
      handleSubmit,
      handleCancel,
      validateLinkUrl,
      validateName,
    },
    cropDialog: {
      cropDialogOpen,
      pendingAvatarFile,
      pendingAvatarPreview,
    },
    fileInputRef,
    isSubmitDisabled,
  };
}
