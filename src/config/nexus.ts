import { Env } from '@/libs/env/env';

export const NEXUS_URL = Env.NEXT_PUBLIC_NEXUS_URL;
export const CDN_URL = Env.NEXT_PUBLIC_CDN_URL;
export const NEXUS_NOTIFICATIONS_LIMIT = 30;
export const NEXUS_POSTS_PER_PAGE = 10; // Number of posts to fetch per page in streams
export const NEXUS_USERS_PER_PAGE = 10; // Number of users to fetch per page in streams
export const STREAM_CACHE_MAX_AGE_MS = Env.NEXT_PUBLIC_STREAM_CACHE_MAX_AGE_MS; // Maximum age for stream cache before considered stale
