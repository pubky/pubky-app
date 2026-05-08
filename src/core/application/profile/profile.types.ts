import { BlobResult, FileResult, PubkyAppUser } from 'pubky-app-specs';
import type { Pubky } from '@/models/models.types';
import type { NexusUserLink } from '@/services/nexus/nexus.types';

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
  name: string;
  bio: string | undefined;
  image: string | null;
  links: NexusUserLink[];
};
