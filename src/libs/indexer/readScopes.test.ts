// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type { MergedRuns } from './indexer.types';
import { createMemoryStore } from './memoryStore';
import { mergeRuns } from './merge';
import { readScopesOf } from './readScopes';
import { META, type Payload, runOf } from './store.contract';
import type { ScopeKey } from './store.types';

describe('readScopesOf', () => {
  const other = { ...META, author: 'bob' };

  it('reads scope by scope, in order, from a store without a bulk read', async () => {
    const store = createMemoryStore<Payload>();
    await store.applyRuns([runOf(0, 2), runOf(0, 3, other)]);
    const readScope = vi.spyOn(store, 'readScope');

    const read = await readScopesOf(store, [other, META]);

    expect(readScope.mock.calls).toEqual([[other], [META]]);
    expect(read).toEqual([mergeRuns([runOf(0, 3, other)]), mergeRuns([runOf(0, 2)])]);
  });

  it("uses the store's bulk read when it has one", async () => {
    const memory = createMemoryStore<Payload>();
    const bulk: MergedRuns<Payload>[] = [mergeRuns([runOf(0, 2)])];
    const readScopes = vi.fn(async (_scopes: readonly ScopeKey[]) => bulk);
    const store = { ...memory, readScopes };
    const readScope = vi.spyOn(store, 'readScope');

    expect(await readScopesOf(store, [META])).toBe(bulk);
    expect(readScopes).toHaveBeenCalledWith([META]);
    expect(readScope).not.toHaveBeenCalled();
  });
});
