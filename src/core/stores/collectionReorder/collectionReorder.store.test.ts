import { beforeEach, describe, expect, it } from 'vitest';
import { useCollectionReorderStore } from './collectionReorder.store';

describe('useCollectionReorderStore', () => {
  beforeEach(() => {
    useCollectionReorderStore.setState({ activeCollectionId: null });
  });

  it('starts with no active reorder', () => {
    expect(useCollectionReorderStore.getState().activeCollectionId).toBeNull();
  });

  it('enter flags the given collection as being reordered', () => {
    useCollectionReorderStore.getState().enter('author:collection1');
    expect(useCollectionReorderStore.getState().activeCollectionId).toBe('author:collection1');
  });

  it('enter replaces a previously active collection', () => {
    const { enter } = useCollectionReorderStore.getState();
    enter('author:collection1');
    enter('author:collection2');
    expect(useCollectionReorderStore.getState().activeCollectionId).toBe('author:collection2');
  });

  it('exit clears the flag and is a no-op when nothing is active', () => {
    const { enter, exit } = useCollectionReorderStore.getState();
    enter('author:collection1');
    exit();
    expect(useCollectionReorderStore.getState().activeCollectionId).toBeNull();
    expect(() => exit()).not.toThrow();
    expect(useCollectionReorderStore.getState().activeCollectionId).toBeNull();
  });
});
