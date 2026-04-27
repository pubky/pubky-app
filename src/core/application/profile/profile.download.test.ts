import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Pubky } from '@/core';
import { asOpaque } from '@/test-utils';

const mockFile = vi.fn();
const mockFolder = vi.fn();
const mockGenerateAsync = vi.fn();
const mockJSZipConstructor = vi.fn();

// Avoid pulling WASM-heavy deps from type-only modules
vi.mock('pubky-app-specs', () => ({
  baseUriBuilder: (pubky: string) => `pubky://${pubky}/pub/pubky.app/`,
  getValidMimeTypes: () => ['image/jpeg', 'image/png'],
}));

// Mock config
vi.mock('@/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/config')>();
  return {
    ...actual,
    DB_NAME: 'test-db',
    DB_VERSION: 1,
    MODERATED_TAGS: [],
    MODERATION_ID: 'test-moderation-id',
  };
});

// Mock the Env module (admin credentials are now server-side only)
vi.mock('@/libs/env/env', () => ({
  Env: {
    HOMESERVER_ADMIN_URL: 'http://test-admin.com',
    HOMESERVER_ADMIN_PASSWORD: 'test-password',
  },
}));

// Mock HomeserverService methods
vi.mock('@/core/services/homeserver', () => ({
  HomeserverService: {
    list: vi.fn(),
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
let Core: typeof import('@/core');

beforeEach(async () => {
  vi.resetModules();
  Core = await import('@/core');
  ({ ProfileApplication } = await import('./profile'));
});

describe('ProfileApplication.downloadData', () => {
  const pubky = 'test-pubky' as Pubky;

  it('should package files into a zip and trigger download', async () => {
    const dataUrls = [`pubky://${pubky}/pub/pubky.app/profile.json`, `pubky://${pubky}/pub/pubky.app/avatar.png`];

    vi.spyOn(Core.HomeserverService, 'list').mockResolvedValue(dataUrls);
    vi.spyOn(Core.HomeserverService, 'get').mockImplementation(async (url: string) => {
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
    expect(jsonFileName).toBe('pub/pubky.app/profile.json');
    expect(jsonContent).toBe('{\n  "name": "Test User"\n}');

    const [binaryFileName, binaryContent, binaryOptions] = mockFile.mock.calls[1];
    expect(binaryFileName).toBe('pub/pubky.app/avatar.png');
    expect(binaryContent).toBeInstanceOf(Uint8Array);
    expect(Array.from(binaryContent as Uint8Array)).toEqual([1, 2, 3]);
    expect(binaryOptions).toEqual({ binary: true });

    expect(mockGenerateAsync).toHaveBeenCalledWith({ type: 'blob' });
    expect(mockCreateObjectURL).toHaveBeenCalledWith(expect.any(Blob));

    expect(mockCreateElement).toHaveBeenCalledWith('a');
    expect(mockAppendChild).toHaveBeenCalledWith(mockAnchorElement);
    expect(mockAnchorElement.href).toBe('blob:mock-url');
    expect(mockAnchorElement.download).toMatch(/^test-pubky_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}_pubky\.app\.zip$/);
    expect(mockClick).toHaveBeenCalledTimes(1);
    expect(mockRemoveChild).toHaveBeenCalledWith(mockAnchorElement);
    expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:mock-url');

    const progressValues = setProgress.mock.calls.map(([value]) => value);
    expect(progressValues).toEqual(expect.arrayContaining([50, 100]));
    expect(progressValues[progressValues.length - 1]).toBe(100);
  });

  it('should pass Infinity as limit to HomeserverService.list', async () => {
    const listSpy = vi.spyOn(Core.HomeserverService, 'list').mockResolvedValue(['file1.json', 'file2.json']);
    // Return a new Response for each call since Response body can only be read once
    vi.spyOn(Core.HomeserverService, 'get').mockImplementation(async () => new Response('{}', { status: 200 }));

    await ProfileApplication.downloadData({ pubky });

    expect(listSpy).toHaveBeenCalledWith({
      baseDirectory: `pubky://${pubky}/pub/pubky.app/`,
      cursor: undefined,
      reverse: false,
      limit: Infinity,
    });
  });

  it('should propagate error when list fails', async () => {
    vi.spyOn(Core.HomeserverService, 'list').mockRejectedValue(new Error('list failed'));
    const getSpy = vi.spyOn(Core.HomeserverService, 'get');

    await expect(ProfileApplication.downloadData({ pubky })).rejects.toThrow('list failed');

    expect(getSpy).not.toHaveBeenCalled();
  });
});
