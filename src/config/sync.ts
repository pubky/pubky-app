import { Env } from '@/libs/env/env';

// TTL Coordinator configuration
export const TTL_POST_MS = Env.NEXT_PUBLIC_TTL_POST_MS;
export const TTL_USER_MS = Env.NEXT_PUBLIC_TTL_USER_MS;
export const TTL_BATCH_INTERVAL_MS = Env.NEXT_PUBLIC_TTL_BATCH_INTERVAL_MS;
export const TTL_POST_MAX_BATCH_SIZE = Env.NEXT_PUBLIC_TTL_POST_MAX_BATCH_SIZE;
export const TTL_USER_MAX_BATCH_SIZE = Env.NEXT_PUBLIC_TTL_USER_MAX_BATCH_SIZE;
