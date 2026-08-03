import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import {
  StreamInvalidationActionTypes,
  streamInvalidationInitialState,
  type StreamInvalidationStore,
} from './streamInvalidation.types';

export const useStreamInvalidationStore = create<StreamInvalidationStore>()(
  devtools(
    (set) => ({
      ...streamInvalidationInitialState,

      invalidateFollowDependentStreams: ({ includeFriends }) => {
        set(
          (state) => ({
            followGraphRevision: state.followGraphRevision + 1,
            friendsRevision: state.friendsRevision + (includeFriends ? 1 : 0),
          }),
          false,
          StreamInvalidationActionTypes.INVALIDATE_FOLLOW_DEPENDENT,
        );
      },

      reset: () => {
        set(streamInvalidationInitialState, false, StreamInvalidationActionTypes.RESET);
      },
    }),
    {
      name: 'stream-invalidation-store',
      enabled: process.env.NODE_ENV === 'development',
    },
  ),
);
