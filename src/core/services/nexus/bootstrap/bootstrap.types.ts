import type { Pubky } from '@/models/models.types';
import type {
  NexusFileDetails,
  NexusHotTag,
  NexusNotification,
  NexusPost,
  NexusPostWire,
  NexusUser,
  NexusUserWire,
} from '@/services/nexus/nexus.types';

/** The bootstrap page past the read boundary: local post kinds, tags with `relationship`. */
export type NexusBootstrapResponse = {
  users: NexusUser[];
  posts: NexusPost[];
  /** `/v0` only: `/v1` serves no file details (0.x attachment metadata comes from `filesApi.getFiles`). */
  files?: NexusFileDetails[];
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
