import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TCopyrightSubmitParams } from './copyright.types';
import { CopyrightApplication } from '@/application/copyright/copyright';
const testData = {
  nameOwner: 'John Doe',
  originalContentUrls: 'https://example.com/original',
  briefDescription: 'Original artwork',
  infringingContentUrl: 'https://example.com/infringing',
  firstName: 'John',
  lastName: 'Doe',
  email: 'john@example.com',
  phoneNumber: '123-456-7890',
  streetAddress: '123 Main St',
  country: 'United States',
  city: 'New York',
  stateProvince: 'NY',
  zipCode: '10001',
  signature: 'John Doe',
  isRightsOwner: true,
  isReportingOnBehalf: false,
};

const createCopyrightParams = (overrides: Partial<TCopyrightSubmitParams> = {}): TCopyrightSubmitParams => ({
  ...testData,
  ...overrides,
});

describe('CopyrightController', () => {
  let CopyrightController: typeof import('./copyright').CopyrightController;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.spyOn(CopyrightApplication, 'submit').mockResolvedValue(undefined);
    const copyrightModule = await import('./copyright');
    CopyrightController = copyrightModule.CopyrightController;
  });

  describe('submit', () => {
    it('should pass validated params to application layer', async () => {
      const params = createCopyrightParams();
      const submitSpy = vi.spyOn(CopyrightApplication, 'submit');

      await CopyrightController.submit(params);

      expect(submitSpy).toHaveBeenCalledWith({
        nameOwner: testData.nameOwner,
        originalContentUrls: testData.originalContentUrls,
        briefDescription: testData.briefDescription,
        infringingContentUrl: testData.infringingContentUrl,
        firstName: testData.firstName,
        lastName: testData.lastName,
        email: testData.email.toLowerCase(),
        phoneNumber: testData.phoneNumber,
        streetAddress: testData.streetAddress,
        country: testData.country,
        city: testData.city,
        stateProvince: testData.stateProvince,
        zipCode: testData.zipCode,
        signature: testData.signature,
        isRightsOwner: true,
        isReportingOnBehalf: false,
      });
    });

    it('should propagate validation errors from validators', async () => {
      const params = createCopyrightParams({ nameOwner: '' });
      await expect(CopyrightController.submit(params)).rejects.toThrow('Name of rights owner is required');
    });

    it('should trim and normalize inputs before passing to application', async () => {
      const params = createCopyrightParams({
        nameOwner: '  John Doe  ',
        firstName: '  John  ',
        lastName: '  Doe  ',
        email: '  JOHN@EXAMPLE.COM  ',
      });
      const submitSpy = vi.spyOn(CopyrightApplication, 'submit');

      await CopyrightController.submit(params);

      expect(submitSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          nameOwner: 'John Doe',
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
        }),
      );
    });

    it('should propagate application layer errors', async () => {
      vi.spyOn(CopyrightApplication, 'submit').mockRejectedValue(new Error('Application error'));
      const params = createCopyrightParams();

      await expect(CopyrightController.submit(params)).rejects.toThrow('Application error');
    });
  });
});
