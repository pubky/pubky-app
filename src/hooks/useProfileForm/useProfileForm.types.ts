import type { RefObject } from 'react';
import type { Pubky } from '@/models/models.types';
import type { NexusUserDetails } from '@/services/nexus/nexus.types';
export type ProfileFormMode = 'create' | 'edit';

export interface ProfileLink {
  label: string;
  url: string;
}

export type SubmitTextKey = 'saveProfile' | 'finish' | 'saving' | 'uploadingAvatar' | 'savingProfile' | 'tryAgain';

export interface ProfileFormState {
  name: string;
  bio: string;
  links: ProfileLink[];
  avatarFile: File | null;
  avatarPreview: string | null;
  isSaving: boolean;
  isLoading: boolean;
  submitTextKey: SubmitTextKey;
}

export interface ProfileFormErrors {
  nameError: string | null;
  bioError: string | null;
  linkUrlErrors: Record<number, string | null>;
  avatarError: string | null;
}

export interface ProfileFormHandlers {
  setName: (name: string) => void;
  setBio: (bio: string) => void;
  setLinks: (links: ProfileLink[]) => void;
  handleChooseFileClick: () => void;
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleDeleteLink: (index: number) => void;
  handleDeleteAvatar: () => void;
  handleCropCancel: () => void;
  handleCropBack: () => void;
  handleCropComplete: (file: File, previewUrl: string) => void;
  handleSubmit: () => Promise<void>;
  handleCancel: () => void;
  validateLinkUrl: (value: string, index: number) => void;
  validateName: (value: string) => void;
}

export interface CropDialogState {
  cropDialogOpen: boolean;
  pendingAvatarFile: File | null;
  pendingAvatarPreview: string | null;
}

export interface UseProfileFormReturn {
  state: ProfileFormState;
  errors: ProfileFormErrors;
  handlers: ProfileFormHandlers;
  cropDialog: CropDialogState;
  fileInputRef: RefObject<HTMLInputElement | null>;
  isSubmitDisabled: boolean;
}

export interface UseProfileFormPropsBase {
  mode: ProfileFormMode;
  pubky: Pubky | null;
}

export interface UseProfileFormPropsCreate extends UseProfileFormPropsBase {
  mode: 'create';
  setShowWelcomeDialog: (show: boolean) => void;
}

export interface UseProfileFormPropsEdit extends UseProfileFormPropsBase {
  mode: 'edit';
  userDetails: NexusUserDetails | null | undefined;
}

export type UseProfileFormProps = UseProfileFormPropsCreate | UseProfileFormPropsEdit;
