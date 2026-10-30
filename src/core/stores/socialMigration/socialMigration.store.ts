import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { createSocialMigrationActions } from './socialMigration.actions';
import { socialMigrationInitialState, type SocialMigrationStore } from './socialMigration.types';

/**
 * The social v1 migration gate's screen state (ADR-0026). Ephemeral: the durable facts live in
 * the localStorage record (`src/libs/social-migration/record.ts`) and on the homeserver. Written
 * by `SocialMigrationController` only; progress fires per object, so it lives apart from
 * `useAuthStore`, whose subscribers (Header, RouteGuard) would re-render on every write.
 */
export const useSocialMigrationStore = create<SocialMigrationStore>()(
  devtools(
    (set) => ({
      ...socialMigrationInitialState,
      ...createSocialMigrationActions(set),
    }),
    {
      name: 'social-migration-store',
      enabled: process.env.NODE_ENV === 'development',
    },
  ),
);
