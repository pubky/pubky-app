// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { contentHash, encodeJson, FakeNetwork } from './fakeNetwork';
import { HomeserverUnreachableError, InvalidIndexInputError, RateLimitedError } from './indexer.errors';
import type { Cursor } from './indexer.types';
import type { AuthoredStreamEvent, ReadEventsRequest } from './transport.types';

const c = (n: number) => BigInt(n);
const brief = (events: AuthoredStreamEvent[]) => events.map((event) => `${event.author}${event.path}@${event.cursor}`);

/** alice and bob on hs1, interleaved: cursors 1..6. */
function twoUsers(): FakeNetwork {
  const network = new FakeNetwork().addHomeserver('hs1').addUser('alice', 'hs1').addUser('bob', 'hs1');
  network.put('alice', '/a/1');
  network.put('bob', '/a/2');
  network.put('alice', '/b/3');
  network.put('bob', '/a/4');
  network.del('alice', '/a/1');
  network.put('bob', '/b/6');
  return network;
}

function request(users: Array<[string, Cursor | null]>, rest: Partial<ReadEventsRequest> = {}): ReadEventsRequest {
  return {
    homeserver: 'hs1',
    users: users.map(([user, cursor]) => ({ user, cursor })),
    paths: ['/'],
    limit: 1000,
    reverse: false,
    ...rest,
  };
}

describe('FakeNetwork.readEvents', () => {
  it('reads forward above each user its own cursor, in cursor order', async () => {
    const events = await twoUsers().readEvents(
      request([
        ['alice', c(3)],
        ['bob', null],
      ]),
    );

    expect(brief(events)).toEqual(['bob/a/2@2', 'bob/a/4@4', 'alice/a/1@5', 'bob/b/6@6']);
  });

  it('applies the limit to the whole request, keeping the lowest cursors', async () => {
    const events = await twoUsers().readEvents(
      request(
        [
          ['alice', null],
          ['bob', null],
        ],
        { limit: 3 },
      ),
    );

    expect(brief(events)).toEqual(['alice/a/1@1', 'bob/a/2@2', 'alice/b/3@3']);
  });

  it('reads backwards below each cursor, newest first, from the end with null', async () => {
    const network = twoUsers();

    const fromEnd = await network.readEvents(request([['bob', null]], { reverse: true, limit: 2 }));
    const below = await network.readEvents(
      request(
        [
          ['alice', c(5)],
          ['bob', c(4)],
        ],
        { reverse: true },
      ),
    );

    expect(brief(fromEnd)).toEqual(['bob/b/6@6', 'bob/a/4@4']);
    expect(brief(below)).toEqual(['alice/b/3@3', 'bob/a/2@2', 'alice/a/1@1']);
  });

  it('keeps only events under the path prefixes, deletes included', async () => {
    const events = await twoUsers().readEvents(request([['alice', null]], { paths: ['/a/'] }));

    expect(events).toEqual([
      { type: 'PUT', path: '/a/1', author: 'alice', cursor: c(1), hash: contentHash(encodeJson('/a/1')) },
      { type: 'DEL', path: '/a/1', author: 'alice', cursor: c(5) },
    ]);
  });

  it('logs every read', async () => {
    const network = twoUsers();

    await network.readEvents(request([['alice', c(4)]], { reverse: true, limit: 1 }));

    expect(network.reads).toEqual([
      { homeserver: 'hs1', users: ['alice'], reverse: true, events: [expect.objectContaining({ cursor: c(3) })] },
    ]);
  });

  it('rejects more than 50 users and a limit above 1000', async () => {
    const network = twoUsers();
    const users = Array.from({ length: 51 }, (_, i): [string, Cursor | null] => [`u${i}`, null]);

    await expect(network.readEvents(request(users))).rejects.toThrow(InvalidIndexInputError);
    await expect(network.readEvents(request([['alice', null]], { limit: 1001 }))).rejects.toThrow(
      InvalidIndexInputError,
    );
  });

  it('fails while down and answers 429 the asked number of times', async () => {
    const network = twoUsers();

    network.setDown('hs1', true);
    await expect(network.readEvents(request([['alice', null]]))).rejects.toThrow(HomeserverUnreachableError);
    network.setDown('hs1', false);
    network.rateLimit('hs1', 2, 30);
    await expect(network.readEvents(request([['alice', null]]))).rejects.toThrow(RateLimitedError);
    await expect(network.getPublic({ author: 'alice', path: '/b/3' })).rejects.toMatchObject({ retryAfterMs: 30 });

    expect(await network.readEvents(request([['alice', null]]))).toHaveLength(3);
  });
});

describe('FakeNetwork files and history', () => {
  it('serves the current bytes of a path, null once deleted or overridden away', async () => {
    const network = twoUsers();
    network.putJson('alice', '/b/3', { v: 2 });
    network.overrideFile('bob', '/a/2', null);

    expect(await network.getPublic({ author: 'alice', path: '/b/3' })).toEqual(encodeJson({ v: 2 }));
    expect(await network.getPublic({ author: 'alice', path: '/a/1' })).toBeNull();
    expect(await network.getPublic({ author: 'bob', path: '/a/2' })).toBeNull();
  });

  it('resolves known users only', async () => {
    const network = twoUsers();

    expect(await network.resolveHomeserver('bob')).toBe('hs1');
    expect(await network.resolveHomeserver('carol')).toBeNull();
  });

  it('restores a homeserver with lower cursors and no deletes', async () => {
    const network = twoUsers();
    network.put('alice', '/b/3');

    network.restore('hs1');

    expect(network.headOf('hs1')).toBe(c(4));
    expect([...network.liveOf('alice', ['/'])]).toEqual([['/b/3', c(2)]]);
    expect([...network.liveOf('bob', ['/'])]).toEqual([
      ['/a/2', c(1)],
      ['/a/4', c(3)],
      ['/b/6', c(4)],
    ]);
  });

  it('computes the live paths above a cursor', () => {
    const network = twoUsers();

    expect([...network.liveOf('bob', ['/a/'], c(2))]).toEqual([['/a/4', c(4)]]);
    expect([...network.lastEvents('alice', ['/a/']).values()].map((event) => event.type)).toEqual(['DEL']);
  });
});
