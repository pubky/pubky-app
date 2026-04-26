import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as Core from '@/core';
import type { TOgMetadataParams } from '@/core';
import { NetworkErrorCode, ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { HttpStatusCode } from '@/libs/http/http.types';

const testData = {
  validUrl: 'https://example.com',
  parsedUrl: new URL('https://example.com'),
};

const createParams = (overrides: Partial<TOgMetadataParams> = {}): TOgMetadataParams => ({
  url: testData.validUrl,
  ...overrides,
});

const createMockResult = (): Core.TOgMetadataResult => ({
  url: testData.validUrl,
  type: 'website',
  title: 'Example Title',
  image: 'https://example.com/image.jpg',
});

describe('OgMetadataController', () => {
  let OgMetadataController: typeof import('./og-metadata').OgMetadataController;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Mock validators and application layer
    vi.spyOn(Core.OgMetadataValidators, 'validate').mockResolvedValue(testData.parsedUrl);
    vi.spyOn(Core.OgMetadataApplication, 'fetch').mockResolvedValue(createMockResult());

    const controllerModule = await import('./og-metadata');
    OgMetadataController = controllerModule.OgMetadataController;
  });

  describe('fetch', () => {
    it('should call validators with the raw URL param', async () => {
      const params = createParams();
      const validateSpy = vi.spyOn(Core.OgMetadataValidators, 'validate');

      await OgMetadataController.fetch(params);

      expect(validateSpy).toHaveBeenCalledWith(testData.validUrl);
    });

    it('should pass the validated URL to the application layer', async () => {
      const params = createParams();
      const fetchSpy = vi.spyOn(Core.OgMetadataApplication, 'fetch');

      await OgMetadataController.fetch(params);

      expect(fetchSpy).toHaveBeenCalledWith(testData.parsedUrl);
    });

    it('should return the application layer result', async () => {
      const mockResult = createMockResult();
      vi.spyOn(Core.OgMetadataApplication, 'fetch').mockResolvedValue(mockResult);

      const result = await OgMetadataController.fetch(createParams());

      expect(result).toEqual(mockResult);
    });

    it('should bubble up validation AppError from validators without wrapping', async () => {
      const validationError = Err.validation(ValidationErrorCode.MISSING_FIELD, 'Invalid URL', {
        service: ErrorService.NextJsServer,
        operation: 'validate',
        context: { field: 'url', statusCode: HttpStatusCode.BAD_REQUEST },
      });
      // NOTE: error-handling rules (.cursor/rules/error-handling.mdc) require that layers
      // re-throw existing AppError instances as-is (no re-wrapping / double-logging).
      // This test guards that OgMetadataController.fetch respects that contract for validator errors.
      vi.spyOn(Core.OgMetadataValidators, 'validate').mockImplementation(() => {
        throw validationError;
      });

      await expect(OgMetadataController.fetch(createParams())).rejects.toThrow(validationError);
    });

    it('should bubble up AppError from application layer without wrapping', async () => {
      const appError = Err.network(NetworkErrorCode.DNS_FAILED, 'DNS resolution failed', {
        service: ErrorService.NextJsServer,
        operation: 'validateDns',
        context: { hostname: 'example.com', statusCode: HttpStatusCode.BAD_REQUEST },
      });
      // NOTE: According to the error-handling rules (.cursor/rules/error-handling.mdc),
      // the controller must re-throw AppError instances coming from the Application layer
      // as-is (no re-wrapping / no mutation / no double-logging).
      // This test ensures that OgMetadataController.fetch adheres to that contract.
      vi.spyOn(Core.OgMetadataApplication, 'fetch').mockRejectedValue(appError);

      await expect(OgMetadataController.fetch(createParams())).rejects.toThrow(appError);
    });

    it('should pass null URL to validators when param is null', async () => {
      const validateSpy = vi.spyOn(Core.OgMetadataValidators, 'validate');

      await OgMetadataController.fetch(createParams({ url: null }));

      expect(validateSpy).toHaveBeenCalledWith(null);
    });
  });
});
