import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import {
  ContextualBannerActionTypes,
  contextualBannerInitialState,
  type ContextualBannerStore,
} from './contextualBanner.types';

/**
 * contextualBanner store
 *
 * Bridges the guest contextual banner
 * ([`GuestContextualBanner`](src/components/organisms/GuestContextualBanner/GuestContextualBanner.tsx))
 * to the other fixed bottom elements of the root layout. The banner owns its
 * timer and visibility rules and raises this flag while it is on screen; the
 * FAB hides for guests and the "Pulse analytics" pill moves above it.
 */
export const useContextualBannerStore = create<ContextualBannerStore>()(
  devtools(
    (set) => ({
      ...contextualBannerInitialState,

      show: () => {
        set({ visible: true }, false, ContextualBannerActionTypes.SHOW);
      },

      hide: () => {
        set({ visible: false }, false, ContextualBannerActionTypes.HIDE);
      },
    }),
    {
      name: 'contextual-banner-store',
      enabled: process.env.NODE_ENV === 'development',
    },
  ),
);
