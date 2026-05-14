import { describe, expect, it } from 'vitest';
import { CDN_URL, NEXUS_URL } from '@/config/nexus';
import { buildFileBodyUrl, filesApi } from './file.api';
import { FileVariant, type TFileBody, type TFileParams } from './file.types';

const pubky = 'qr3xqyz3e5cyf9npgxc5zfp15ehhcis6gqsxob4une7bwwazekry';
const encodedPubky = encodeURIComponent(pubky);
const fileId = 'test-file';
const encodedFileId = encodeURIComponent(fileId);

describe('File API', () => {
  describe('filesApi.getAvatarUrl', () => {
    it('should generate correct avatar URL for valid pubky', () => {
      const result = filesApi.getAvatarUrl(pubky);
      expect(result).toBe(`${CDN_URL}/avatar/${encodedPubky}`);
    });

    it('should append version query param when provided', () => {
      const version = 12345;
      const result = filesApi.getAvatarUrl(pubky, version);
      expect(result).toBe(`${CDN_URL}/avatar/${encodedPubky}?v=${version}`);
    });
  });

  describe('filesApi.getFileUrl', () => {
    it('should generate correct URL for SMALL variant', () => {
      const params: TFileParams = {
        pubky,
        file_id: fileId,
        variant: FileVariant.SMALL,
      };

      const result = filesApi.getFileUrl(params);
      expect(result).toBe(`${CDN_URL}/files/${encodedPubky}/${encodedFileId}/small`);
    });

    it('should generate correct URL for FEED variant', () => {
      const params: TFileParams = {
        pubky,
        file_id: fileId,
        variant: FileVariant.FEED,
      };

      const result = filesApi.getFileUrl(params);
      expect(result).toBe(`${CDN_URL}/files/${encodedPubky}/${encodedFileId}/feed`);
    });

    it('should generate correct URL for MAIN variant', () => {
      const params: TFileParams = {
        pubky,
        file_id: fileId,
        variant: FileVariant.MAIN,
      };

      const result = filesApi.getFileUrl(params);
      expect(result).toBe(`${CDN_URL}/files/${encodedPubky}/${encodedFileId}/main`);
    });
  });

  describe('filesApi.getFiles', () => {
    it('should handle single file URI', () => {
      const fileUris = [pubky];
      const result = filesApi.getFiles(fileUris);

      expect(result.url).toBe(`${NEXUS_URL}/v0/files/by_ids`);
      expect(result.body).toEqual({ uris: fileUris });
    });

    it('should handle multiple file URIs', () => {
      const fileUris = [pubky, `${pubky}-2`, `${pubky}-3`];
      const result = filesApi.getFiles(fileUris);

      expect(result.url).toBe(`${NEXUS_URL}/v0/files/by_ids`);
      expect(result.body).toEqual({ uris: fileUris });
    });

    it('should handle large number of file URIs', () => {
      const fileUris = Array.from({ length: 100 }, (_, i) => `${pubky}-${i}`);
      const result = filesApi.getFiles(fileUris);

      expect(result.url).toBe(`${NEXUS_URL}/v0/files/by_ids`);
      expect(result.body).toEqual({ uris: fileUris });
      expect(result.body.uris).toHaveLength(100);
    });

    it('should handle empty file URIs array', () => {
      const fileUris: string[] = [];
      const result = filesApi.getFiles(fileUris);

      expect(result.url).toBe(`${NEXUS_URL}/v0/files/by_ids`);
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
