import type { Pubky } from '@/models/models.types';
import type {
  NexusFileDetails,
  NexusHotTag,
  NexusNotification,
  NexusPost,
  NexusUser,
} from '@/services/nexus/nexus.types';

export type NexusBootstrapResponse = {
  users: NexusUser[];
  posts: NexusPost[];
  files: NexusFileDetails[];
  ids: NexusBootstrapList;
  indexed: boolean;
  notifications: NexusNotification[];
};

export type NexusBootstrapList = {
  stream: string[];
  influencers: Pubky[];
  recommended: Pubky[];
  hot_tags: NexusHotTag[];
  muted: Pubky[];
};
