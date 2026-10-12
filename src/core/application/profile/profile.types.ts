import type { Built, User } from 'pubky-social-specs';
import type { Pubky } from '@/models/models.types';
import type { ProfileChanges } from '@/pipes/pipes.types';

export type TCreateProfileInput = {
  profile: Built<User>;
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
