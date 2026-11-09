import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { TEST_PUBKY } from '@/pipes/pipes.test-utils';

vi.mock('@/services/homeserver/homeserver', () => ({
  HomeserverService: { putBlob: vi.fn(), request: vi.fn(), deleteIdempotent: vi.fn() },
}));
vi.mock('@/services/nexus/file/file', () => ({ NexusFileService: { fetchFiles: vi.fn() } }));

// 13-character Crockford base32 timestamp minted by pubky-app-specs `createFile`
const FILE_ID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{13}$/;
const PINNED_NOW = Date.now();

let FileApplication: typeof import('@/application/file/file').FileApplication;
let sleepSpy: MockInstance<(ms: number) => Promise<void>>;

const toFileAttachment = (name: string) =>
  FileApplication.toFileAttachment({
    file: new File([name], name, { type: 'application/pdf' }),
    pubky: TEST_PUBKY.USER_1,
  });

// Exercise the real normalizer and pubky-app-specs id minting together. The
// clock is pinned so every mint in a test lands in the same millisecond, and
// only the guard's own retry delay moves it on: without the guard the ids
// would be identical.
describe('FileApplication.toFileAttachment with the real pubky-app-specs builder', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(PINNED_NOW);
    sleepSpy = vi.spyOn(await import('@/libs/utils/utils'), 'sleep').mockImplementation(async () => {
      vi.setSystemTime(Date.now() + 1);
    });
    ({ FileApplication } = await import('@/application/file/file'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('mints a strictly newer file id for each attachment normalized in sequence', async () => {
    const first = await toFileAttachment('one.pdf');
    const second = await toFileAttachment('two.pdf');

    expect(first.fileResult.meta.id).toMatch(FILE_ID_PATTERN);
    expect(second.fileResult.meta.id).toMatch(FILE_ID_PATTERN);
    expect(second.fileResult.meta.id > first.fileResult.meta.id).toBe(true);
    expect(second.fileResult.meta.url).not.toBe(first.fileResult.meta.url);
    // the second mint collided with the first and waited for the next millisecond
    expect(sleepSpy).toHaveBeenCalledTimes(1);
  });

  it('mints distinct file ids for attachments normalized concurrently', async () => {
    const attachments = await Promise.all([
      toFileAttachment('one.pdf'),
      toFileAttachment('two.pdf'),
      toFileAttachment('three.pdf'),
    ]);

    const ids = attachments.map((attachment) => attachment.fileResult.meta.id);
    const urls = attachments.map((attachment) => attachment.fileResult.meta.url);
    expect(new Set(ids).size).toBe(3);
    expect(new Set(urls).size).toBe(3);
    expect(sleepSpy).toHaveBeenCalled();
  });
});
