import { beforeEach, describe, expect, it } from 'vitest';
import { usePubchiStore } from './pubchi.store';

const OWNER = 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo';

describe('PubchiStore', () => {
  beforeEach(() => {
    usePubchiStore.getState().clear();
  });

  it('rejects a recovery phrase at runtime', () => {
    expect(() =>
      usePubchiStore.getState().setPubchi(
        {
          bot: OWNER,
          displayName: 'Bot',
          createdAt: 1,
          backupConfirmedAt: null,
          verified: true,
          phrase: 'secret',
        } as never,
        OWNER,
      ),
    ).toThrow('Pubchi recovery phrase cannot be stored');
  });

  it('opens, closes, and consumes flyout prefill', () => {
    const prefill = { question: 'Summarize this thread pubky://owner/posts/1', source: 'post-menu' as const };

    usePubchiStore.getState().openFlyout(prefill, OWNER);
    expect(usePubchiStore.getState().flyout).toEqual({ open: true, prefill: { ...prefill, ownerPubky: OWNER } });

    expect(usePubchiStore.getState().consumePrefill(OWNER)).toEqual(prefill);
    expect(usePubchiStore.getState().flyout).toEqual({ open: true });

    usePubchiStore.getState().closeFlyout();
    expect(usePubchiStore.getState().flyout).toEqual({ open: false });
  });

  it('keeps feed builder intent after closing the flyout', () => {
    usePubchiStore.getState().openFlyout();
    usePubchiStore.getState().openFeedBuilder();
    usePubchiStore.getState().closeFlyout();

    expect(usePubchiStore.getState().flyout.open).toBe(false);
    expect(usePubchiStore.getState().feedBuilder.open).toBe(true);

    usePubchiStore.getState().closeFeedBuilder();
    expect(usePubchiStore.getState().feedBuilder).toEqual({ open: false });
  });

  it('does not consume a prefill belonging to another owner', () => {
    const prefill = { question: 'Summarize this thread', source: 'post-menu' as const };

    usePubchiStore.getState().openFlyout(prefill, OWNER);

    expect(usePubchiStore.getState().consumePrefill('different-owner' as never)).toBeUndefined();
    expect(usePubchiStore.getState().flyout).toEqual({ open: true });
  });

  it('clears flyout state with the signed-out Pubchi state', () => {
    usePubchiStore.getState().openFlyout(
      {
        question: 'Summarize this thread',
        source: 'post-menu',
      },
      OWNER,
    );

    usePubchiStore.getState().clear();

    expect(usePubchiStore.getState().flyout).toEqual({ open: false });
  });

  it('keeps alternating turns within the owner-scoped window', () => {
    usePubchiStore.getState().setConfig(null, OWNER);
    for (let index = 0; index < 6; index += 1) {
      usePubchiStore
        .getState()
        .addConversationTurn({ role: index % 2 === 0 ? 'user' : 'assistant', text: `turn-${index}` }, OWNER);
    }
    expect(usePubchiStore.getState().conversation.turns.map((turn) => turn.text)).toEqual([
      'turn-0',
      'turn-1',
      'turn-2',
      'turn-3',
      'turn-4',
      'turn-5',
    ]);
    usePubchiStore.getState().addConversationTurn({ role: 'user', text: 'new' }, OWNER);
    expect(usePubchiStore.getState().conversation.turns[0]?.role).toBe('user');
    expect(usePubchiStore.getState().conversation.turns).toHaveLength(7);
  });

  it('clears the conversation when opening a post-menu summarize', () => {
    const first = {
      question: 'Summarize this thread pubky://owner/pub/pubky.app/posts/post-1',
      source: 'post-menu' as const,
      target: { kind: 'post' as const, uri: 'pubky://owner/pub/pubky.app/posts/post-1' },
    };
    const second = {
      question: 'Summarize this thread pubky://owner/pub/pubky.app/posts/post-2',
      source: 'post-menu' as const,
      target: { kind: 'post' as const, uri: 'pubky://owner/pub/pubky.app/posts/post-2' },
    };
    usePubchiStore.getState().setConfig(null, OWNER);
    usePubchiStore.getState().openFlyout(first, OWNER);
    usePubchiStore.getState().addConversationTurn({ role: 'user', text: first.question }, OWNER);
    usePubchiStore.getState().addConversationTurn({ role: 'assistant', text: 'First summary' }, OWNER);

    usePubchiStore.getState().openFlyout(second, OWNER);

    expect(usePubchiStore.getState().conversation.turns).toEqual([]);
    expect(usePubchiStore.getState().conversationGeneration).toBeGreaterThan(0);
    expect(usePubchiStore.getState().flyout.prefill).toEqual({ ...second, ownerPubky: OWNER });
  });

  it('starts a fresh conversation when summarizing the same post from the menu again', () => {
    const prefill = {
      question: 'Summarize this thread pubky://owner/pub/pubky.app/posts/post-1',
      source: 'post-menu' as const,
      target: { kind: 'post' as const, uri: 'pubky://owner/pub/pubky.app/posts/post-1' },
    };
    usePubchiStore.getState().setConfig(null, OWNER);
    usePubchiStore.getState().openFlyout(prefill, OWNER);
    usePubchiStore.getState().addConversationTurn({ role: 'user', text: prefill.question }, OWNER);
    usePubchiStore.getState().addConversationTurn({ role: 'assistant', text: 'First summary' }, OWNER);
    const generation = usePubchiStore.getState().conversationGeneration;

    usePubchiStore.getState().openFlyout(prefill, OWNER);

    expect(usePubchiStore.getState().conversation.turns).toEqual([]);
    expect(usePubchiStore.getState().conversationGeneration).toBeGreaterThan(generation);
  });

  it('does not clear the conversation for chip or empty flyout opens', () => {
    usePubchiStore.getState().setConfig(null, OWNER);
    usePubchiStore.getState().addConversationTurn({ role: 'user', text: 'prior' }, OWNER);
    usePubchiStore.getState().addConversationTurn({ role: 'assistant', text: 'answer' }, OWNER);
    const generation = usePubchiStore.getState().conversationGeneration;

    usePubchiStore.getState().openFlyout(
      {
        question: 'Suggest tags for this user',
        source: 'chip',
        target: { kind: 'user', uri: 'pubky://owner/pub/pubky.app/profile.json' },
      },
      OWNER,
    );
    expect(usePubchiStore.getState().conversation.turns).toHaveLength(2);
    expect(usePubchiStore.getState().conversationGeneration).toBe(generation);

    usePubchiStore.getState().openFlyout();
    expect(usePubchiStore.getState().conversation.turns).toHaveLength(2);
    expect(usePubchiStore.getState().conversationGeneration).toBe(generation);
  });

  it('isolates owners and clears on owner change', () => {
    usePubchiStore.getState().setConfig(null, OWNER);
    usePubchiStore.getState().addConversationTurn({ role: 'user', text: 'private' }, OWNER);
    usePubchiStore.getState().addConversationTurn({ role: 'assistant', text: 'answer' }, OWNER);
    usePubchiStore.getState().setConfig(null, 'different-owner' as never);
    expect(usePubchiStore.getState().conversation.turns).toEqual([]);
    expect(usePubchiStore.getState().proactiveSuggestions).toEqual([]);
    usePubchiStore.getState().addConversationTurn({ role: 'user', text: 'ignored' }, OWNER);
    expect(usePubchiStore.getState().conversation.turns).toEqual([]);
  });
});
