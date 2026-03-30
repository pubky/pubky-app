import * as Core from '@/core';

export type NexusBootstrapResponse = {
  users: Core.NexusUser[];
  posts: Core.NexusPost[];
  files: Core.NexusFileDetails[];
  ids: Core.NexusBootstrapList;
  indexed: boolean;
  notifications: Core.NexusNotification[];
};

export type NexusBootstrapList = {
  stream: string[];
  influencers: Core.Pubky[];
  recommended: Core.Pubky[];
  hot_tags: Core.NexusHotTag[];
  muted: Core.Pubky[];
};
