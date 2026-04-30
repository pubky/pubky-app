import type { TPubkyParams } from '@/controllers/auth/auth.types';
export type TBootstrapParams = TPubkyParams & {
  lastReadUrl: string;
};
