interface StreamInvalidationState {
  followGraphRevision: number;
  friendsRevision: number;
}

interface StreamInvalidationActions {
  invalidateFollowDependentStreams: (options: { includeFriends: boolean }) => void;
  reset: () => void;
}

export type StreamInvalidationStore = StreamInvalidationState & StreamInvalidationActions;

export const streamInvalidationInitialState: StreamInvalidationState = {
  followGraphRevision: 0,
  friendsRevision: 0,
};

export enum StreamInvalidationActionTypes {
  INVALIDATE_FOLLOW_DEPENDENT = 'INVALIDATE_FOLLOW_DEPENDENT',
  RESET = 'RESET',
}
