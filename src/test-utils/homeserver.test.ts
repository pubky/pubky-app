import { buildPost, buildUri, decodeObject, listPrefix } from 'pubky-social-specs';
import { fakeOwner } from 'pubky-social-specs/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hasHttpStatus } from '@/libs/error/error.utils';
import { HttpMethod, HttpStatusCode } from '@/libs/http/http.types';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { stubMemoryHomeserver } from './homeserver';
import { freezeSpecClock, restoreSpecClock } from './spec-clock';

describe('stubMemoryHomeserver', () => {
  const owner = fakeOwner(1);

  afterEach(() => {
    vi.restoreAllMocks();
    restoreSpecClock();
  });

  it('stores what putBlob writes and reads it back through getBytes, exists and list', async () => {
    const { spies } = stubMemoryHomeserver(owner);
    const post = buildPost(owner, { content: 'Hello' });

    await HomeserverService.putBlob({ url: post.url, blob: post.body });

    expect(decodeObject(post.url, await HomeserverService.getBytes(post.url), 'post').content).toBe('Hello');
    expect(await HomeserverService.exists(post.url)).toBe(true);
    expect(await HomeserverService.list({ baseDirectory: `${listPrefix(owner, 'public')}posts/` })).toEqual([post.url]);
    expect(await HomeserverService.listAll({ baseDirectory: `${listPrefix(owner, 'public')}posts/` })).toEqual([
      post.url,
    ]);
    expect(spies.putBlob).toHaveBeenCalledTimes(1);
  });

  it('answers request GET, PUT and DELETE as JSON on the owner tree', async () => {
    stubMemoryHomeserver(owner);
    const url = `pubky://${owner}/priv/app.pubky/v1/settings.json`;

    await HomeserverService.request({ method: HttpMethod.PUT, url, bodyJson: { theme: 'dark' } });
    expect(await HomeserverService.request({ method: HttpMethod.GET, url })).toEqual({ theme: 'dark' });
    expect(await HomeserverService.getBytesIfExists(url)).toMatchObject({ modifiedAt: null });

    await HomeserverService.request({ method: HttpMethod.DELETE, url });
    expect(await HomeserverService.getBytesIfExists(url)).toBeNull();
    expect(await HomeserverService.exists(url)).toBe(false);
  });

  it('reports a missing file as the 404 AppError the real service throws, and an empty directory as []', async () => {
    stubMemoryHomeserver(owner);
    const url = buildUri(owner, 'post', '0032PARTQP4G0');

    const error = await HomeserverService.getBytes(url).catch((caught: unknown) => caught);
    expect(hasHttpStatus(error, HttpStatusCode.NOT_FOUND)).toBe(true);
    expect(await HomeserverService.list({ baseDirectory: `${listPrefix(owner, 'public')}posts/` })).toEqual([]);
    await expect(HomeserverService.deleteIdempotent(url)).resolves.toBeUndefined();
  });

  it("reads a friend's public tree and refuses to write to it", async () => {
    const { friend, friendSession } = stubMemoryHomeserver(owner);
    const post = buildPost(friend, { content: 'Theirs' });
    await friendSession.storage.putBytes(post.path, post.body);

    expect(await HomeserverService.exists(post.url)).toBe(true);
    expect(decodeObject(post.url, await HomeserverService.getBytes(post.url), 'post').content).toBe('Theirs');
    await expect(HomeserverService.putBlob({ url: post.url, blob: post.body })).rejects.toMatchObject({
      operation: 'putBlob',
    });
    await expect(HomeserverService.delete(post.url)).rejects.toMatchObject({ operation: 'delete' });
  });

  it('gives deterministic ids under the frozen spec clock', () => {
    freezeSpecClock();
    const first = buildPost(owner, { content: 'a' }).id;
    restoreSpecClock();
    freezeSpecClock();
    expect(buildPost(owner, { content: 'b' }).id).toBe(first);
  });
});
