import { beforeEach, describe, expect, it } from 'vitest';
import { useGraphStore } from './graph.store';
import { graphInitialState } from './graph.types';

describe('GraphStore', () => {
  beforeEach(() => {
    useGraphStore.getState().reset();
  });

  it('initializes with everything visible and modes off', () => {
    const state = useGraphStore.getState();
    expect(state.declutter).toBe(graphInitialState.declutter);
    expect(state.hiddenClasses).toEqual([]);
    expect(state.communitiesOn).toBe(false);
  });

  it('toggles declutter and communities', () => {
    useGraphStore.getState().toggleDeclutter();
    expect(useGraphStore.getState().declutter).toBe(true);
    useGraphStore.getState().toggleCommunities();
    expect(useGraphStore.getState().communitiesOn).toBe(true);
    useGraphStore.getState().toggleDeclutter();
    expect(useGraphStore.getState().declutter).toBe(false);
  });

  it('setDeclutter sets an absolute value (auto-declutter path)', () => {
    useGraphStore.getState().setDeclutter(true);
    expect(useGraphStore.getState().declutter).toBe(true);
    useGraphStore.getState().setDeclutter(true);
    expect(useGraphStore.getState().declutter).toBe(true);
  });

  it('toggleClass adds then removes a hidden class', () => {
    useGraphStore.getState().toggleClass('post');
    useGraphStore.getState().toggleClass('follower');
    expect(useGraphStore.getState().hiddenClasses).toEqual(['post', 'follower']);
    useGraphStore.getState().toggleClass('post');
    expect(useGraphStore.getState().hiddenClasses).toEqual(['follower']);
  });

  it('hands a header-search pick to the graph and clears it after consumption', () => {
    useGraphStore.getState().requestSearch({ kind: 'user', pubky: 'abc' });
    expect(useGraphStore.getState().searchTarget).toEqual({ kind: 'user', pubky: 'abc' });
    useGraphStore.getState().clearSearchTarget();
    expect(useGraphStore.getState().searchTarget).toBeNull();
  });

  it('reset restores every preference', () => {
    useGraphStore.getState().setDeclutter(true);
    useGraphStore.getState().toggleClass('tag');
    useGraphStore.getState().toggleCommunities();
    useGraphStore.getState().reset();
    const state = useGraphStore.getState();
    expect(state.declutter).toBe(false);
    expect(state.hiddenClasses).toEqual([]);
    expect(state.communitiesOn).toBe(false);
  });
});
