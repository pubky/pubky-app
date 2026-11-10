import type { Pubky } from '@/models/models.types';
import type {
  NexusHotTag,
  NexusNotification,
  NexusPost,
  NexusPostWire,
  NexusUser,
  NexusUserWire,
} from '@/services/nexus/nexus.types';

/**
 * The bootstrap page past the read boundary: local post kinds, tags with `relationship`. `/v1` serves no
 * `files`: the 0.x attachment metadata of the page comes from `FileApplication.fetchFilesForPosts`.
 */
export type NexusBootstrapResponse = {
  users: NexusUser[];
  posts: NexusPost[];
  ids: NexusBootstrapList;
  indexed: boolean;
  notifications: NexusNotification[];
};

/** The bootstrap page as Nexus serves it (see `NexusPostWire`, `NexusUserWire`). */
export type NexusBootstrapWire = Omit<NexusBootstrapResponse, 'users' | 'posts'> & {
  users: NexusUserWire[];
  posts: NexusPostWire[];
};

export type NexusBootstrapList = {
  stream: string[];
  influencers: Pubky[];
  recommended: Pubky[];
  hot_tags: NexusHotTag[];
};
