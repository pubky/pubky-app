import { fakeOwner } from 'pubky-social-specs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pubky } from '@/models/models.types';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { asOpaque } from '@/test-utils/type-assertions';

const mockFile = vi.fn();
const mockFolder = vi.fn();
const mockGenerateAsync = vi.fn();
const mockJSZipConstructor = vi.fn();

// Mock config
vi.mock('@/config/database', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/config/database')>();
  return {
    ...actual,
    DB_NAME: 'test-db',
    DB_VERSION: 1,
  };
});

vi.mock('@/config/moderation', () => ({
  MODERATED_TAGS: [],
  MODERATION_ID: 'test-moderation-id',
}));

// Mock the Env module (admin credentials are now server-side only).
// Merge with real Env so @/config/database still gets NEXT_PUBLIC_DB_NAME / NEXT_PUBLIC_DB_VERSION
// (franky is loaded via the module graph; a partial Env would break Dexie.version()).
vi.mock('@/libs/env/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/libs/env/env')>();
  return {
    Env: {
      ...actual.Env,
      HOMESERVER_ADMIN_URL: 'http://test-admin.com',
      HOMESERVER_ADMIN_PASSWORD: 'test-password',
    },
  };
});

// Mock HomeserverService methods
vi.mock('@/services/homeserver/homeserver', () => ({
  HomeserverService: {
    listAll: vi.fn(),
    get: vi.fn(),
  },
}));

// Mock JSZip
vi.mock('jszip', () => {
  return {
    default: mockJSZipConstructor,
  };
});

// Mock DOM APIs
const mockCreateElement = vi.fn();
const mockAppendChild = vi.fn();
const mockRemoveChild = vi.fn();
const mockClick = vi.fn();
const mockCreateObjectURL = vi.fn().mockReturnValue('blob:mock-url');
const mockRevokeObjectURL = vi.fn();
let mockAnchorElement: { href: string; download: string; click: typeof mockClick };

beforeEach(() => {
  // Reset mocks
  vi.clearAllMocks();

  mockFolder.mockReturnValue({
    file: mockFile,
  });
  mockGenerateAsync.mockResolvedValue(new Blob(['test']));
  mockJSZipConstructor.mockImplementation(function (this: {
    folder: typeof mockFolder;
    generateAsync: typeof mockGenerateAsync;
  }) {
    this.folder = mockFolder;
    this.generateAsync = mockGenerateAsync;
    return this;
  });

  // Setup DOM mocks
  mockAnchorElement = {
    href: '',
    download: '',
    click: mockClick,
  };
  mockCreateElement.mockReturnValue(mockAnchorElement);

  global.document = asOpaque<Document>({
    createElement: mockCreateElement,
    body: {
      appendChild: mockAppendChild,
      removeChild: mockRemoveChild,
    },
  });

  // Don't override the entire URL object, just the methods we need
  URL.createObjectURL = mockCreateObjectURL;
  URL.revokeObjectURL = mockRevokeObjectURL;
});

let ProfileApplication: typeof import('./profile').ProfileApplication;

beforeEach(async () => {
  vi.resetModules();
  ({ ProfileApplication } = await import('./profile'));
});

describe('ProfileApplication.downloadData', () => {
  const pubky = fakeOwner(1) as Pubky;
  const TREES = ['/pub/pubky.app/', '/pub/social/v1/', '/priv/social/', '/priv/app.pubky/v1/'];

  it('should package files into a zip and trigger download', async () => {
    const dataUrls = [`pubky://${pubky}/pub/social/v1/profile.json`, `pubky://${pubky}/pub/social/v1/files/avatar.png`];

    vi.spyOn(HomeserverService, 'listAll').mockImplementation(async ({ baseDirectory }) =>
      baseDirectory.endsWith('/pub/social/v1/') ? dataUrls : [],
    );
    vi.spyOn(HomeserverService, 'get').mockImplementation(async (url: string) => {
      if (url.endsWith('profile.json')) {
        return new Response(JSON.stringify({ name: 'Test User' }), { status: 200 });
      } else {
        return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
      }
    });

    const setProgress = vi.fn();

    await ProfileApplication.downloadData({ pubky, setProgress });

    expect(mockJSZipConstructor).toHaveBeenCalledTimes(1);
    expect(mockFolder).toHaveBeenCalledWith('data');
    expect(mockFile).toHaveBeenCalledTimes(2);

    const [jsonFileName, jsonContent] = mockFile.mock.calls[0];
    expect(jsonFileName).toBe('pub/social/v1/profile.json');
    expect(jsonContent).toBe('{\n  "name": "Test User"\n}');

    const [binaryFileName, binaryContent, binaryOptions] = mockFile.mock.calls[1];
    expect(binaryFileName).toBe('pub/social/v1/files/avatar.png');
    expect(binaryContent).toBeInstanceOf(Uint8Array);
    expect(Array.from(binaryContent as Uint8Array)).toEqual([1, 2, 3]);
    expect(binaryOptions).toEqual({ binary: true });

    expect(mockGenerateAsync).toHaveBeenCalledWith({ type: 'blob' });
    expect(mockCreateObjectURL).toHaveBeenCalledWith(expect.any(Blob));

    expect(mockCreateElement).toHaveBeenCalledWith('a');
    expect(mockAppendChild).toHaveBeenCalledWith(mockAnchorElement);
    expect(mockAnchorElement.href).toBe('blob:mock-url');
    expect(mockAnchorElement.download).toMatch(
      new RegExp(`^${pubky}_\\d{4}-\\d{2}-\\d{2}_\\d{2}-\\d{2}-\\d{2}_pubky\\.app\\.zip$`),
    );
    expect(mockClick).toHaveBeenCalledTimes(1);
    expect(mockRemoveChild).toHaveBeenCalledWith(mockAnchorElement);
    expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:mock-url');

    const progressValues = setProgress.mock.calls.map(([value]) => value);
    expect(progressValues).toEqual(expect.arrayContaining([50, 100]));
    expect(progressValues[progressValues.length - 1]).toBe(100);
  });

  it('should enumerate every tree of the account via the paginated listAll', async () => {
    const listSpy = vi.spyOn(HomeserverService, 'listAll').mockResolvedValue([]);

    await ProfileApplication.downloadData({ pubky });

    expect(listSpy.mock.calls.map(([params]) => params.baseDirectory)).toEqual(
      TREES.map((tree) => `pubky://${pubky}${tree}`),
    );
  });

  it('names every file by its path under the account, whichever tree it is in', async () => {
    const perTree: Record<string, string[]> = {
      '/pub/pubky.app/': ['/pub/pubky.app/posts/0001'],
      '/pub/social/v1/': ['/pub/social/v1/profile.json'],
      '/priv/social/': ['/priv/social/v1/bookmarks/b1.json', '/priv/social/unlocked/lock1/post.json'],
      '/priv/app.pubky/v1/': ['/priv/app.pubky/v1/settings.json'],
    };
    vi.spyOn(HomeserverService, 'listAll').mockImplementation(async ({ baseDirectory }) =>
      (perTree[baseDirectory.replace(`pubky://${pubky}`, '')] ?? []).map((path) => `pubky://${pubky}${path}`),
    );
    // Return a new Response for each call since Response body can only be read once
    vi.spyOn(HomeserverService, 'get').mockImplementation(async () => new Response('{}', { status: 200 }));

    await ProfileApplication.downloadData({ pubky });

    expect(mockFile.mock.calls.map(([fileName]) => fileName).sort()).toEqual([
      'priv/app.pubky/v1/settings.json',
      'priv/social/unlocked/lock1/post.json',
      'priv/social/v1/bookmarks/b1.json',
      'pub/pubky.app/posts/0001',
      'pub/social/v1/profile.json',
    ]);
  });

  it('should propagate error when list fails', async () => {
    vi.spyOn(HomeserverService, 'listAll').mockRejectedValue(new Error('list failed'));
    const getSpy = vi.spyOn(HomeserverService, 'get');

    await expect(ProfileApplication.downloadData({ pubky })).rejects.toThrow('list failed');

    expect(getSpy).not.toHaveBeenCalled();
  });
});
