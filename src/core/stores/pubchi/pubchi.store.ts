import { create } from 'zustand';
import type { LoadedPubchi } from '@/application/pubchi/pubchi.types';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import type { Conversation, ConversationTurn, PubchiTarget } from '@/libs/pubchi/schemas/ask-body';
import type { PubchiConfigV1 } from '@/libs/pubchi/schemas/config';
import type { PubchiOwnerContextV1 } from '@/libs/pubchi/schemas/context';
import type { FeedProposalV2 } from '@/libs/pubchi/schemas/feed';
import type { PubchiSuggestionV1 } from '@/libs/pubchi/schemas/suggestion';
import type { Pubky } from '@/models/models.types';

type StoredPubchi = Omit<LoadedPubchi, 'phrase'>;
type NoPhrase<T> = T & { phrase?: never };
export type PubchiFlyoutPrefill = {
  question: string;
  source: 'post-menu' | 'chip';
  feedId?: string;
  target?: PubchiTarget;
};
type StoredPubchiFlyoutPrefill = PubchiFlyoutPrefill & { ownerPubky: Pubky };
export type PubchiFlyoutState = {
  open: boolean;
  prefill?: StoredPubchiFlyoutPrefill;
};
export type PubchiFeedBuilderState = {
  open: boolean;
  proposal?: FeedProposalV2;
};

export interface PubchiStore {
  pubchi: StoredPubchi | undefined;
  config: PubchiConfigV1 | null;
  context: PubchiOwnerContextV1 | null;
  ownerPubky: Pubky | null;
  lastUpdatedAt: number | null;
  syncReloadCount: number;
  databaseBlocked: boolean;
  flyout: PubchiFlyoutState;
  feedBuilder: PubchiFeedBuilderState;
  quickQuestionsOpen: boolean;
  conversation: Conversation;
  conversationGeneration: number;
  proactiveSuggestions: PubchiSuggestionV1[];
  setPubchi: (pubchi: NoPhrase<StoredPubchi> | undefined, ownerPubky: Pubky | null) => void;
  setConfig: (config: PubchiConfigV1 | null, ownerPubky: Pubky | null) => void;
  setContext: (context: PubchiOwnerContextV1 | null, ownerPubky: Pubky | null) => void;
  setProactiveSuggestions: (suggestions: PubchiSuggestionV1[], ownerPubky: Pubky | null) => void;
  openFlyout: (prefill?: PubchiFlyoutPrefill, ownerPubky?: Pubky | null) => void;
  closeFlyout: () => void;
  openFeedBuilder: (proposal?: FeedProposalV2) => void;
  closeFeedBuilder: () => void;
  setQuickQuestionsOpen: (open: boolean) => void;
  addConversationTurn: (turn: ConversationTurn, ownerPubky: Pubky) => void;
  clearConversation: () => void;
  consumePrefill: (ownerPubky?: Pubky | null) => PubchiFlyoutPrefill | undefined;
  recordSyncReload: () => void;
  setDatabaseBlocked: (blocked: boolean) => void;
  clear: () => void;
}

const initialState = {
  pubchi: undefined,
  config: null,
  context: null,
  ownerPubky: null,
  lastUpdatedAt: null,
  syncReloadCount: 0,
  databaseBlocked: false,
  flyout: { open: false },
  feedBuilder: { open: false },
  quickQuestionsOpen: false,
  conversation: { turns: [] },
  conversationGeneration: 0,
  proactiveSuggestions: [] as PubchiSuggestionV1[],
};

export const usePubchiStore = create<PubchiStore>((set, get) => ({
  ...initialState,
  setPubchi: (pubchi, ownerPubky) => {
    if (pubchi && Object.prototype.hasOwnProperty.call(pubchi, 'phrase')) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Pubchi recovery phrase cannot be stored', {
        service: ErrorService.Pubchi,
        operation: 'setPubchi',
      });
    }
    set({
      pubchi,
      ownerPubky,
      lastUpdatedAt: Date.now(),
      ...(get().ownerPubky !== ownerPubky ? { conversation: { turns: [] }, proactiveSuggestions: [] } : {}),
    });
  },
  setConfig: (config, ownerPubky) =>
    set({
      config,
      ownerPubky,
      lastUpdatedAt: Date.now(),
      ...(get().ownerPubky !== ownerPubky ? { conversation: { turns: [] }, proactiveSuggestions: [] } : {}),
    }),
  setContext: (context, ownerPubky) =>
    set({
      context,
      ownerPubky,
      lastUpdatedAt: Date.now(),
      ...(get().ownerPubky !== ownerPubky ? { conversation: { turns: [] }, proactiveSuggestions: [] } : {}),
    }),
  setProactiveSuggestions: (proactiveSuggestions, ownerPubky) =>
    set({
      proactiveSuggestions,
      ownerPubky,
      lastUpdatedAt: Date.now(),
      ...(get().ownerPubky !== ownerPubky ? { conversation: { turns: [] } } : {}),
    }),
  openFlyout: (prefill, ownerPubky) => {
    if (prefill?.source === 'post-menu') {
      get().clearConversation();
    }
    set({
      flyout: {
        open: true,
        ...(prefill && ownerPubky ? { prefill: { ...prefill, ownerPubky } } : {}),
      },
    });
  },
  closeFlyout: () => set({ flyout: { open: false } }),
  openFeedBuilder: (proposal) =>
    set({
      feedBuilder: {
        open: true,
        ...(proposal ? { proposal } : {}),
      },
    }),
  closeFeedBuilder: () => set({ feedBuilder: { open: false } }),
  setQuickQuestionsOpen: (quickQuestionsOpen) => set({ quickQuestionsOpen }),
  addConversationTurn: (turn, ownerPubky) => {
    if (get().ownerPubky !== ownerPubky) return;
    const turns = [...get().conversation.turns, turn];
    const trimmed = turns.length % 2 === 0 ? turns.slice(-8) : turns.slice(-7);
    let total = trimmed.reduce((sum, item) => sum + Array.from(item.text).length, 0);
    while (total > 4_800 && trimmed.length >= 2) {
      const removed = trimmed.splice(0, 2);
      total -= removed.reduce((sum, item) => sum + Array.from(item.text).length, 0);
    }
    set({ conversation: { turns: trimmed } });
  },
  clearConversation: () =>
    set((state) => ({
      conversation: { turns: [] },
      conversationGeneration: state.conversationGeneration + 1,
    })),
  recordSyncReload: () => set((state) => ({ syncReloadCount: state.syncReloadCount + 1 })),
  setDatabaseBlocked: (databaseBlocked) => set({ databaseBlocked }),
  consumePrefill: (ownerPubky): PubchiFlyoutPrefill | undefined => {
    const prefill = get().flyout.prefill;
    if (prefill) {
      set({ flyout: { open: true } });
      if (prefill.ownerPubky !== ownerPubky) return undefined;
      const { ownerPubky: _ownerPubky, ...consumed } = prefill;
      return consumed;
    }
    return undefined;
  },
  clear: () => set(initialState),
}));
