import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCdnUrl, getNexusUrl, getV1CdnUrl, NEXUS_FILES_BY_IDS_MAX_URIS } from '@/config/nexus';
import { queryNexus } from '@/services/nexus/nexus.utils';
import { NexusFileService } from './file';
import { buildFileBodyUrl, filesApi } from './file.api';
import { FileVariant, type TFileBody, type TFileParams } from './file.types';

vi.mock('@/services/nexus/nexus.utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/nexus/nexus.utils')>()),
  queryNexus: vi.fn(),
}));

const pubky = 'qr3xqyz3e5cyf9npgxc5zfp15ehhcis6gqsxob4une7bwwazekry';
const encodedPubky = encodeURIComponent(pubky);
const fileId = 'test-file';
const encodedFileId = encodeURIComponent(fileId);

describe('File API', () => {
  describe('filesApi.getAvatarUrl', () => {
    it('should generate correct avatar URL for valid pubky', () => {
      const result = filesApi.getAvatarUrl(pubky);
      expect(result).toBe(`${getCdnUrl()}/avatar/${encodedPubky}`);
    });

    it('should append version query param when provided', () => {
      const version = 12345;
      const result = filesApi.getAvatarUrl(pubky, version);
      expect(result).toBe(`${getCdnUrl()}/avatar/${encodedPubky}?v=${version}`);
    });
  });

  describe('filesApi.getFileUrl', () => {
    const HASH = '7BKXG1FPF2D680NCPW5D82BAGM';
    const TSID = '0034A0X7NJ52C';

    it.each(Object.values(FileVariant))('routes a 0.x file id to the 0.x static base (%s)', (variant) => {
      expect(filesApi.getFileUrl({ pubky, file_id: TSID, variant })).toBe(
        `${getCdnUrl()}/files/${encodedPubky}/${TSID}/${variant}`,
      );
    });

    it.each(Object.values(FileVariant))('routes a `{hash}.{ext}` id to the v1 static base (%s)', (variant) => {
      expect(filesApi.getFileUrl({ pubky, file_id: `${HASH}.png`, variant })).toBe(
        `${getV1CdnUrl()}/files/${encodedPubky}/${HASH}.png/${variant}`,
      );
    });

    it('spells both routes as the Nexus contract does', () => {
      const nexus = 'https://nexus.staging.pubky.app';
      expect(filesApi.getFileUrl({ pubky, file_id: TSID, variant: FileVariant.MAIN })).toBe(
        `${nexus}/static/files/${encodedPubky}/${TSID}/main`,
      );
      expect(filesApi.getFileUrl({ pubky, file_id: `${HASH}.png`, variant: FileVariant.MAIN })).toBe(
        `${nexus}/v1/static/files/${encodedPubky}/${HASH}.png/main`,
      );
    });

    it('keeps avatars on the existing static base', () => {
      expect(filesApi.getAvatarUrl(pubky)).toBe(`https://nexus.staging.pubky.app/static/avatar/${encodedPubky}`);
    });

    it('should generate correct URL for SMALL variant', () => {
      const params: TFileParams = {
        pubky,
        file_id: fileId,
        variant: FileVariant.SMALL,
      };

      const result = filesApi.getFileUrl(params);
      expect(result).toBe(`${getCdnUrl()}/files/${encodedPubky}/${encodedFileId}/small`);
    });

    it('should generate correct URL for FEED variant', () => {
      const params: TFileParams = {
        pubky,
        file_id: fileId,
        variant: FileVariant.FEED,
      };

      const result = filesApi.getFileUrl(params);
      expect(result).toBe(`${getCdnUrl()}/files/${encodedPubky}/${encodedFileId}/feed`);
    });

    it('should generate correct URL for LARGE variant', () => {
      const params: TFileParams = {
        pubky,
        file_id: fileId,
        variant: FileVariant.LARGE,
      };

      const result = filesApi.getFileUrl(params);
      expect(result).toBe(`${getCdnUrl()}/files/${encodedPubky}/${encodedFileId}/large`);
    });

    it('should generate correct URL for MAIN variant', () => {
      const params: TFileParams = {
        pubky,
        file_id: fileId,
        variant: FileVariant.MAIN,
      };

      const result = filesApi.getFileUrl(params);
      expect(result).toBe(`${getCdnUrl()}/files/${encodedPubky}/${encodedFileId}/main`);
    });
  });

  describe('filesApi.getFiles', () => {
    it('should handle single file URI', () => {
      const fileUris = [pubky];
      const result = filesApi.getFiles(fileUris);

      expect(result.url).toBe(`${getNexusUrl()}/v0/files/by_ids`);
      expect(result.body).toEqual({ uris: fileUris });
    });

    it('should handle multiple file URIs', () => {
      const fileUris = [pubky, `${pubky}-2`, `${pubky}-3`];
      const result = filesApi.getFiles(fileUris);

      expect(result.url).toBe(`${getNexusUrl()}/v0/files/by_ids`);
      expect(result.body).toEqual({ uris: fileUris });
    });

    it('should handle large number of file URIs', () => {
      const fileUris = Array.from({ length: 100 }, (_, i) => `${pubky}-${i}`);
      const result = filesApi.getFiles(fileUris);

      expect(result.url).toBe(`${getNexusUrl()}/v0/files/by_ids`);
      expect(result.body).toEqual({ uris: fileUris });
      expect(result.body.uris).toHaveLength(100);
    });

    it('should handle empty file URIs array', () => {
      const fileUris: string[] = [];
      const result = filesApi.getFiles(fileUris);

      expect(result.url).toBe(`${getNexusUrl()}/v0/files/by_ids`);
      expect(result.body).toEqual({ uris: [] });
      expect(result.body.uris).toHaveLength(0);
    });
  });

  describe('buildFileBodyUrl', () => {
    it('should build correct body for single file URI', () => {
      const fileUris: string[] = [pubky];
      const result: TFileBody = buildFileBodyUrl(fileUris);
      expect(result).toEqual({ uris: fileUris });
    });

    it('should build correct body for multiple file URIs', () => {
      const fileUris: string[] = [pubky, `${pubky}-2`, `${pubky}-3`];
      const result: TFileBody = buildFileBodyUrl(fileUris);
      expect(result).toEqual({ uris: fileUris });
    });

    it('should return new object instance (not reference)', () => {
      const fileUris: string[] = [pubky];
      const result1: TFileBody = buildFileBodyUrl(fileUris);
      const result2: TFileBody = buildFileBodyUrl(fileUris);

      expect(result1).toEqual(result2);
      expect(result1).not.toBe(result2); // Different object instances
    });

    it('should handle empty file URIs array', () => {
      const fileUris: string[] = [];
      const result: TFileBody = buildFileBodyUrl(fileUris);
      expect(result).toEqual({ uris: [] });
      expect(result.uris).toHaveLength(0);
    });
  });

  describe('FilesApiEndpoint type', () => {
    it('should have exactly 3 endpoints', () => {
      const endpointKeys = Object.keys(filesApi);
      expect(endpointKeys).toHaveLength(3);
      expect(endpointKeys).toContain('getAvatarUrl');
      expect(endpointKeys).toContain('getFileUrl');
      expect(endpointKeys).toContain('getFiles');
    });
  });
});

describe('NexusFileService.fetchFiles', () => {
  beforeEach(() => {
    vi.mocked(queryNexus).mockReset();
  });

  it('asks the frozen /v0 route in one request for a list within the cap', async () => {
    const uris = ['pubky://o/pub/pubky.app/files/A', 'pubky://o/pub/pubky.app/files/B'];
    vi.mocked(queryNexus).mockResolvedValue([{ id: 'A' }]);

    const files = await NexusFileService.fetchFiles(uris);

    expect(queryNexus).toHaveBeenCalledExactlyOnceWith({
      url: `${getNexusUrl()}/v0/files/by_ids`,
      method: 'POST',
      body: JSON.stringify({ uris }),
    });
    expect(files).toEqual([{ id: 'A' }]);
  });

  it('splits more uris than one request takes into sequential slices and concatenates the answers', async () => {
    const uris = Array.from(
      { length: NEXUS_FILES_BY_IDS_MAX_URIS + 1 },
      (_, i) => `pubky://o/pub/pubky.app/files/${i}`,
    );
    vi.mocked(queryNexus).mockImplementation(async ({ body }) =>
      (JSON.parse(body as string) as { uris: string[] }).uris.map((uri) => ({ uri })),
    );

    const files = await NexusFileService.fetchFiles(uris);

    const requested = vi
      .mocked(queryNexus)
      .mock.calls.map(([{ body }]) => (JSON.parse(body as string) as { uris: string[] }).uris);
    expect(requested).toEqual([uris.slice(0, NEXUS_FILES_BY_IDS_MAX_URIS), uris.slice(NEXUS_FILES_BY_IDS_MAX_URIS)]);
    expect(files.map((file) => file.uri)).toEqual(uris);
  });

  it('sends nothing for an empty list', async () => {
    expect(await NexusFileService.fetchFiles([])).toEqual([]);
    expect(queryNexus).not.toHaveBeenCalled();
  });
});
