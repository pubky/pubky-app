import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OgMetadataApplication } from '@/application/og-metadata/og-metadata';
import type { TOgMetadataParams } from '@/application/og-metadata/og-metadata.types';
import { AuthErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { HttpStatusCode } from '@/libs/http/http.types';
import { OgMetadataValidators } from '@/pipes/og-metadata/og-metadata.validators';

const testData = {
  validUrl: 'https://example.com',
  parsedUrl: new URL('https://example.com'),
};

const createParams = (overrides: Partial<TOgMetadataParams> = {}): TOgMetadataParams => ({
  url: testData.validUrl,
  ...overrides,
});

const createMockMetadata = () => ({
  url: testData.validUrl,
  type: 'website' as const,
  title: 'Example Title',
  image: 'https://example.com/image.jpg',
});

describe('OgMetadataController', () => {
  let OgMetadataController: typeof import('./og-metadata').OgMetadataController;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Mock validators and application layer
    vi.spyOn(OgMetadataValidators, 'validateSafe').mockResolvedValue({ ok: true, url: testData.parsedUrl });
    vi.spyOn(OgMetadataApplication, 'fetch').mockResolvedValue(createMockMetadata());

    const controllerModule = await import('./og-metadata');
    OgMetadataController = controllerModule.OgMetadataController;
  });

  describe('fetch', () => {
    it('should call validators with the raw URL param', async () => {
      const params = createParams();
      const validateSpy = vi.spyOn(OgMetadataValidators, 'validateSafe');

      await OgMetadataController.fetch(params);

      expect(validateSpy).toHaveBeenCalledWith(testData.validUrl);
    });

    it('should pass the validated URL to the application layer', async () => {
      const params = createParams();
      const fetchSpy = vi.spyOn(OgMetadataApplication, 'fetch');

      await OgMetadataController.fetch(params);

      expect(fetchSpy).toHaveBeenCalledWith(testData.parsedUrl);
    });

    it('should return the application layer result', async () => {
      const mockResult = createMockMetadata();
      vi.spyOn(OgMetadataApplication, 'fetch').mockResolvedValue(mockResult);

      const result = await OgMetadataController.fetch(createParams());

      expect(result).toEqual({ ok: true, metadata: mockResult });
    });

    it('should bubble up AppError from application layer unchanged', async () => {
      const appError = Err.auth(AuthErrorCode.FORBIDDEN, 'Blocked IP', {
        service: ErrorService.NextJsServer,
        operation: 'checkDnsSafety',
      });
      vi.spyOn(OgMetadataApplication, 'fetch').mockRejectedValue(appError);

      await expect(OgMetadataController.fetch(createParams())).rejects.toBe(appError);
    });

    it('should return validation failures without throwing AppError', async () => {
      vi.spyOn(OgMetadataValidators, 'validateSafe').mockResolvedValue({
        ok: false,
        message: 'Invalid URL',
        statusCode: HttpStatusCode.BAD_REQUEST,
      });

      await expect(OgMetadataController.fetch(createParams())).resolves.toEqual({
        ok: false,
        message: 'Invalid URL',
        statusCode: HttpStatusCode.BAD_REQUEST,
      });
    });

    it('should pass null URL to validators when param is null', async () => {
      const validateSpy = vi.spyOn(OgMetadataValidators, 'validateSafe');

      await OgMetadataController.fetch(createParams({ url: null }));

      expect(validateSpy).toHaveBeenCalledWith(null);
    });
  });
});
