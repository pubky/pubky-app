import { toPath } from 'pubky-social-specs';
import { createSocialClient } from 'pubky-social-specs/client';
import { memoryHomeserver } from 'pubky-social-specs/testing';
import { vi } from 'vitest';
import { HomeserverService } from '@/services/homeserver/homeserver';

/**
 * Backs the v1 write path with an in-memory homeserver signed in as `owner`. `putBlob` stores the
 * exact bytes and `social` reads them back, so an edit finds the version an earlier write left.
 * Returns the `putBlob` spy, for tests that hold, reject or inspect a write.
 */
export function stubMemoryHomeserver(owner: string) {
  const { sessionOf, publicStorage } = memoryHomeserver();
  const session = sessionOf(owner);
  const social = createSocialClient(session, { publicStorage });
  vi.spyOn(HomeserverService, 'social').mockImplementation((operation) => operation(social));
  return vi
    .spyOn(HomeserverService, 'putBlob')
    .mockImplementation(({ url, blob }) => session.storage.putBytes(toPath(url), blob).then(() => undefined));
}

/** The JSON a `putBlob` call wrote. */
export const putBlobJson = ([{ blob }]: Parameters<typeof HomeserverService.putBlob>) =>
  JSON.parse(new TextDecoder().decode(blob));
