import { getCdnUrl, getNexusUrl, getStreamCacheMaxAgeMs } from '@/libs/runtime-config/runtime-config';

// Runtime-configurable: read via getters at call time (values come from PUBKY_RUNTIME_* in
// deployed environments, NEXT_PUBLIC_* defaults locally). See @/libs/runtime-config.
export { getCdnUrl, getNexusUrl };

export const NEXUS_NOTIFICATIONS_LIMIT = 30;
export const NEXUS_POSTS_PER_PAGE = 10; // Number of posts to fetch per page in streams
export const NEXUS_USERS_PER_PAGE = 10; // Number of users to fetch per page in streams
export { getStreamCacheMaxAgeMs };
