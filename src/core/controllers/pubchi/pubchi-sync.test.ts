import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PubchiSyncMessage } from './pubchi-sync';
import { subscribeToPubchiSync } from './pubchi-sync';

const OWNER = 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo';

class TestBroadcastChannel {
  static instance: TestBroadcastChannel | undefined;
  private listener: ((event: MessageEvent<unknown>) => void) | undefined;

  constructor() {
    TestBroadcastChannel.instance = this;
  }

  addEventListener(_type: string, listener: (event: MessageEvent<unknown>) => void): void {
    this.listener = listener;
  }

  removeEventListener(): void {
    this.listener = undefined;
  }

  close(): void {}

  emit(data: unknown): void {
    this.listener?.({ data } as MessageEvent<unknown>);
  }
}

describe('Pubchi sync subscriptions', () => {
  beforeEach(() => {
    vi.stubGlobal('BroadcastChannel', TestBroadcastChannel);
    vi.spyOn(Date, 'now').mockReturnValue(100_000);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    TestBroadcastChannel.instance = undefined;
  });

  it('ignores NaN, future-dated, and malformed-owner messages', () => {
    const onMessage = vi.fn<(message: PubchiSyncMessage) => void>();
    const unsubscribe = subscribeToPubchiSync(onMessage);
    const channel = TestBroadcastChannel.instance;

    channel?.emit({ owner: OWNER, kind: 'created', at: Number.NaN });
    channel?.emit({ owner: OWNER, kind: 'created', at: 106_000 });
    channel?.emit({ owner: 'malformed-owner', kind: 'created', at: 100_000 });

    expect(onMessage).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('delivers a valid message', () => {
    const onMessage = vi.fn<(message: PubchiSyncMessage) => void>();
    const unsubscribe = subscribeToPubchiSync(onMessage);
    const channel = TestBroadcastChannel.instance;
    const message = { owner: OWNER, kind: 'created', at: 100_000 };

    channel?.emit(message);

    expect(onMessage).toHaveBeenCalledWith(message);
    unsubscribe();
  });
});
