import { PubkyAppPostKind } from 'pubky-app-specs';
import type { TFileAttachmentResult } from '@/pipes/file/file.types';
import type { NexusUserDetails } from '@/services/nexus/nexus.types';
export type PostValidatorData = {
  content: string;
  kind: PubkyAppPostKind;
  parentUri?: string;
  embed?: string;
  attachments?: TFileAttachmentResult[];
};

export type UserValidatorData = Omit<NexusUserDetails, 'id' | 'indexed_at'>;
