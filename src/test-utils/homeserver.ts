import { memoryHomeserver } from 'pubky-social-specs/testing';
import { vi } from 'vitest';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { hasHttpStatus } from '@/libs/error/error.utils';
import { HttpMethod, HttpStatusCode } from '@/libs/http/http.types';
import { parsePubkyUri } from '@/models/models.utils';
import { extractStatusCode, handleError } from '@/services/homeserver/error.utils';
import { HomeserverService } from '@/services/homeserver/homeserver';

/** A page of a directory listing; the real service paginates `listAll` in pages of this size. */
const LIST_PAGE = 500;

/**
 * Backs `HomeserverService` with an in-memory homeserver (`pubky-social-specs/testing`) signed in
 * as `owner`: `putBlob` stores the exact bytes, reads (`getFreshBytes` included) and listings answer from the same store, so
 * a test exercises the real pipes and applications against the real data model instead of
 * asserting on spy arguments. Writes to another owner's tree are refused like the real service
 * refuses them; reads of anyone's public tree work. Errors reach the caller as the `AppError`
 * the real service would throw (a missing file is a 404).
 *
 * Returns the two users the store knows, their sessions, the public storage and every spy, for
 * tests that hold, reject or inspect a call.
 */
export function stubMemoryHomeserver(owner: string) {
  const memory = memoryHomeserver();
  const session = memory.sessionOf(owner);
  const { friend, friendSession, publicStorage } = memory;

  const locate = (url: string, operation: string) => {
    const parsed = parsePubkyUri(url);
    if (!parsed) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, `Not a pubky URL: ${url}`, {
        service: ErrorService.Homeserver,
        operation,
        context: { url },
      });
    }
    return { owned: parsed.authority === owner, owner: parsed.authority, path: parsed.path };
  };
  const ownedPath = (url: string, operation: string) => {
    const { owned, path } = locate(url, operation);
    if (!owned) {
      throw Err.validation(
        ValidationErrorCode.INVALID_INPUT,
        'Authenticated writes must target an owned /pub/* or /priv/* path for the current session.',
        { service: ErrorService.Homeserver, operation, context: { url, statusCode: HttpStatusCode.BAD_REQUEST } },
      );
    }
    return path;
  };
  // The owner's whole tree through the session; anyone else's public tree only, as the SDK serves it.
  const readBytes = (url: string, operation: string) => {
    const { owned, path } = locate(url, operation);
    return owned ? session.storage.getBytes(path) : publicStorage.getBytes(url);
  };
  const listUrls = (directory: string, cursor: string | null, reverse: boolean, limit: number) => {
    const { owned, owner: directoryOwner, path } = locate(directory, 'list');
    const dirPath = path.endsWith('/') ? path : `${path}/`;
    return owned
      ? session.storage.list(dirPath, cursor, reverse, limit, false)
      : publicStorage.list(`pubky://${directoryOwner}${dirPath}`, cursor, reverse, limit, false);
  };
  const existsAt = (url: string) => {
    const { owned, path } = locate(url, 'exists');
    return owned
      ? session.storage.exists(path)
      : publicStorage.getBytes(url).then(
          () => true,
          (error: unknown) => {
            if (extractStatusCode(error) === HttpStatusCode.NOT_FOUND) return false;
            throw error;
          },
        );
  };
  const asAppError = (url: string, method: HttpMethod, operation: string) => (error: unknown) =>
    handleError({ error, additionalContext: { url, method, operation } });

  const putBlob = vi.spyOn(HomeserverService, 'putBlob').mockImplementation(async ({ url, blob }) => {
    await session.storage.putBytes(ownedPath(url, 'putBlob'), blob).catch(asAppError(url, HttpMethod.PUT, 'putBlob'));
  });

  const getBytes = vi
    .spyOn(HomeserverService, 'getBytes')
    .mockImplementation(async (url) => readBytes(url, 'getBytes').catch(asAppError(url, HttpMethod.GET, 'getBytes')));

  // Public only, as the real one: a raw fetch that carries no session.
  const getFreshBytes = vi
    .spyOn(HomeserverService, 'getFreshBytes')
    .mockImplementation(async (url) =>
      publicStorage.getBytes(url).catch(asAppError(url, HttpMethod.GET, 'getFreshBytes')),
    );

  const request = vi.spyOn(HomeserverService, 'request').mockImplementation(async ({ method, url, bodyJson }) => {
    switch (method) {
      case HttpMethod.GET: {
        const bytes = await readBytes(url, 'request').catch(asAppError(url, method, 'request'));
        const text = new TextDecoder().decode(bytes);
        return text ? JSON.parse(text) : undefined;
      }
      case HttpMethod.PUT:
        await session.storage
          .putJson(ownedPath(url, 'request'), structuredClone(bodyJson ?? {}))
          .catch(asAppError(url, method, 'request'));
        return undefined;
      case HttpMethod.DELETE:
        await session.storage.delete(ownedPath(url, 'request')).catch(asAppError(url, method, 'request'));
        return undefined;
      default:
        throw Err.validation(ValidationErrorCode.INVALID_INPUT, `Unsupported method ${method}`, {
          service: ErrorService.Homeserver,
          operation: 'request',
          context: { url, method },
        });
    }
  });

  const remove = vi.spyOn(HomeserverService, 'delete').mockImplementation(async (url) => {
    await session.storage.delete(ownedPath(url, 'delete')).catch(asAppError(url, HttpMethod.DELETE, 'delete'));
  });

  const deleteIdempotent = vi.spyOn(HomeserverService, 'deleteIdempotent').mockImplementation(async (url) => {
    try {
      await HomeserverService.delete(url);
    } catch (error) {
      if (!hasHttpStatus(error, HttpStatusCode.NOT_FOUND)) throw error;
    }
  });

  const list = vi
    .spyOn(HomeserverService, 'list')
    .mockImplementation(async ({ baseDirectory, cursor, reverse = false, limit = LIST_PAGE }) => {
      try {
        return await listUrls(baseDirectory, cursor ?? null, reverse, limit);
      } catch (error) {
        if (extractStatusCode(error) === HttpStatusCode.NOT_FOUND) return [];
        return handleError({ error, additionalContext: { url: baseDirectory, baseDirectory } });
      }
    });

  const listAll = vi.spyOn(HomeserverService, 'listAll').mockImplementation(async ({ baseDirectory }) => {
    const files: string[] = [];
    let cursor: string | undefined;
    for (;;) {
      const batch = await HomeserverService.list({ baseDirectory, cursor, limit: LIST_PAGE });
      files.push(...batch);
      if (batch.length < LIST_PAGE) return files;
      cursor = batch[batch.length - 1];
    }
  });

  const getBytesIfExists = vi.spyOn(HomeserverService, 'getBytesIfExists').mockImplementation(async (url) => {
    try {
      return { bytes: await session.storage.getBytes(ownedPath(url, 'getBytesIfExists')), modifiedAt: null };
    } catch (error) {
      if (extractStatusCode(error) === HttpStatusCode.NOT_FOUND) return null;
      return handleError({ error, additionalContext: { url, method: HttpMethod.GET } });
    }
  });

  const exists = vi
    .spyOn(HomeserverService, 'exists')
    .mockImplementation(async (url) => existsAt(url).catch(asAppError(url, HttpMethod.GET, 'exists')));

  return {
    owner,
    session,
    friend,
    friendSession,
    publicStorage,
    spies: {
      putBlob,
      request,
      delete: remove,
      deleteIdempotent,
      list,
      listAll,
      getBytes,
      getFreshBytes,
      getBytesIfExists,
      exists,
    },
  };
}
