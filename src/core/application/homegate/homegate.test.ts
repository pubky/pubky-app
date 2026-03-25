import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as Core from '@/core';

const testData = {
  inviteCode: 'test-invite-code-123',
  verificationId: '550e8400-e29b-41d4-a716-446655440000',
  phoneNumber: '+1234567890',
  smsCode: '123456',
};

describe('HomegateApplication', () => {
  let HomegateApplication: typeof import('./homegate').HomegateApplication;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Mock service methods
    vi.spyOn(Core.HomegateService, 'getLnVerificationInfo').mockResolvedValue({
      available: true,
      amountSat: 1000,
    });

    vi.spyOn(Core.HomegateService, 'createLnVerification').mockResolvedValue({
      id: testData.verificationId,
      bolt11Invoice: 'lnbc1000...',
      amountSat: 1000,
      expiresAt: Date.now() + 600000,
    });

    vi.spyOn(Core.HomegateService, 'awaitLnVerification').mockResolvedValue({
      success: true,
      data: {
        id: testData.verificationId,
        amountSat: 1000,
        expiresAt: Date.now() + 600000,
        isPaid: true,
        signupCode: 'signup-code-123',
        homeserverPubky: 'pk1homeserver...',
        createdAt: Date.now(),
      },
    });

    vi.spyOn(Core.HomegateService, 'verifySmsCode').mockResolvedValue({
      valid: true,
      signupCode: 'signup-code-123',
      homeserverPubky: 'pk1homeserver...',
    });

    vi.spyOn(Core.HomegateService, 'sendSmsCode').mockResolvedValue({
      success: true,
    });

    vi.spyOn(Core.ExchangerateService, 'getSatoshiUsdRate').mockResolvedValue({
      satUsd: 0.0005,
      btcUsd: 50000,
      lastUpdatedAt: new Date(),
    });

    const homegateModule = await import('./homegate');
    HomegateApplication = homegateModule.HomegateApplication;
  });

  describe('getLnVerificationInfo', () => {
    it('should delegate to HomegateService and return LN info', async () => {
      const result = await HomegateApplication.getLnVerificationInfo();

      expect(Core.HomegateService.getLnVerificationInfo).toHaveBeenCalled();
      expect(result).toEqual({ available: true, amountSat: 1000 });
    });
  });

  describe('createLnVerification', () => {
    it('should delegate to HomegateService and return verification details', async () => {
      const result = await HomegateApplication.createLnVerification();

      expect(Core.HomegateService.createLnVerification).toHaveBeenCalled();
      expect(result).toMatchObject({
        id: testData.verificationId,
        bolt11Invoice: 'lnbc1000...',
        amountSat: 1000,
      });
    });
  });

  describe('awaitLnVerification', () => {
    it('should delegate to HomegateService with verification ID', async () => {
      const result = await HomegateApplication.awaitLnVerification(testData.verificationId);

      expect(Core.HomegateService.awaitLnVerification).toHaveBeenCalledWith(testData.verificationId);
      expect(result).toMatchObject({
        success: true,
        data: {
          id: testData.verificationId,
          isPaid: true,
          signupCode: 'signup-code-123',
        },
      });
    });
  });

  describe('verifySmsCode', () => {
    it('should delegate to HomegateService with phone number and code', async () => {
      const result = await HomegateApplication.verifySmsCode({
        phoneNumber: testData.phoneNumber,
        code: testData.smsCode,
      });

      expect(Core.HomegateService.verifySmsCode).toHaveBeenCalledWith({
        phoneNumber: testData.phoneNumber,
        code: testData.smsCode,
      });
      expect(result).toEqual({
        valid: true,
        signupCode: 'signup-code-123',
        homeserverPubky: 'pk1homeserver...',
      });
    });
  });

  describe('sendSmsCode', () => {
    it('should delegate to HomegateService with phone number', async () => {
      const result = await HomegateApplication.sendSmsCode(testData.phoneNumber);

      expect(Core.HomegateService.sendSmsCode).toHaveBeenCalledWith(testData.phoneNumber);
      expect(result).toEqual({ success: true });
    });
  });

  describe('getBtcRate', () => {
    it('should delegate to ExchangerateService and return BTC rate', async () => {
      const result = await HomegateApplication.getBtcRate();

      expect(Core.ExchangerateService.getSatoshiUsdRate).toHaveBeenCalled();
      expect(result).toMatchObject({
        satUsd: 0.0005,
        btcUsd: 50000,
      });
    });
  });
});
