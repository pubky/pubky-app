import { beforeEach, describe, expect, it } from 'vitest';
import { PostStreamDirtyRegistry } from './postStreamDirtyRegistry';

const followingAll = 'timeline:following:all';
const friendsAll = 'timeline:friends:all';
const wotAll = 'timeline:wot:all';
const depthTwoDomain = 'timeline:wot_domain:2:all:developer';
const depthZeroDomain = 'timeline:wot_domain:0:all:developer';
const globalAll = 'timeline:all:all';

describe('PostStreamDirtyRegistry', () => {
  let registry: PostStreamDirtyRegistry;

  beforeEach(() => {
    registry = new PostStreamDirtyRegistry();
  });

  it('starts clean for every stream', () => {
    expect(registry.isDirty(followingAll)).toBe(false);
    expect(registry.isDirty(friendsAll)).toBe(false);
    expect(registry.isDirty(depthTwoDomain)).toBe(false);
    expect(registry.isDirty(globalAll)).toBe(false);
  });

  it('marks only the streams depending on the dirtied scope', () => {
    registry.markDirty('follow_graph');

    expect(registry.isDirty(followingAll)).toBe(true);
    expect(registry.isDirty(wotAll)).toBe(true);
    expect(registry.isDirty(depthTwoDomain)).toBe(true);
    expect(registry.isDirty(friendsAll)).toBe(false);
    expect(registry.isDirty(depthZeroDomain)).toBe(false);
  });

  it('marks profile-tag-dependent domain streams at every depth', () => {
    registry.markDirty('profile_tag');

    expect(registry.isDirty(depthZeroDomain)).toBe(true);
    expect(registry.isDirty(depthTwoDomain)).toBe(true);
    expect(registry.isDirty(followingAll)).toBe(false);
    expect(registry.isDirty(friendsAll)).toBe(false);
  });

  it('never marks streams without dependency scopes', () => {
    registry.markDirty('follow_graph');
    registry.markDirty('friends');
    registry.markDirty('profile_tag');

    expect(registry.isDirty(globalAll)).toBe(false);
    expect(registry.isDirty('author:some-pubky')).toBe(false);
  });

  it('clears dirtiness only for the reconciled stream', () => {
    registry.markDirty('follow_graph');
    registry.markReconciled(followingAll);

    expect(registry.isDirty(followingAll)).toBe(false);
    expect(registry.isDirty(wotAll)).toBe(true);
  });

  it('re-marks a reconciled stream when its scope is dirtied again', () => {
    registry.markDirty('follow_graph');
    registry.markReconciled(followingAll);
    registry.markDirty('follow_graph');

    expect(registry.isDirty(followingAll)).toBe(true);
  });

  it('keeps a multi-scope stream dirty until all its scopes are reconciled', () => {
    registry.markDirty('follow_graph');
    registry.markReconciled(depthTwoDomain);
    registry.markDirty('profile_tag');

    expect(registry.isDirty(depthTwoDomain)).toBe(true);

    registry.markReconciled(depthTwoDomain);
    expect(registry.isDirty(depthTwoDomain)).toBe(false);
  });

  it('reset restores the pristine state', () => {
    registry.markDirty('follow_graph');
    registry.markReconciled(followingAll);
    registry.reset();

    expect(registry.isDirty(followingAll)).toBe(false);
    registry.markDirty('follow_graph');
    expect(registry.isDirty(followingAll)).toBe(true);
  });
});
