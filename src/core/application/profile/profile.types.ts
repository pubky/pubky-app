import { BlobResult, FileResult, PubkyAppUser } from 'pubky-app-specs';
import type { Pubky } from '@/models/models.types';
import type { ProfileChanges } from '@/pipes/pipes.types';

export type TUploadAvatarInput = {
  blobResult: BlobResult;
  fileResult: FileResult;
};

export type TCreateProfileInput = {
  profile: PubkyAppUser;
  url: string;
  pubky: Pubky;
};

export type TDeleteAccountParams = {
  pubky: Pubky;
  setProgress?: (progress: number) => void;
};

export type TDownloadDataParams = {
  pubky: Pubky;
  setProgress?: (progress: number) => void;
};

export type TApplicationCommitUpdateDetailsParams = {
  pubky: Pubky;
  changes: ProfileChanges;
};
