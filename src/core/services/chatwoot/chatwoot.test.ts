import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { asOpaque, mockResponse } from '@/test-utils';
import type {
  TChatwootContact,
  TChatwootContactSearchResponse,
  TChatwootCreateContactResponse,
} from './chatwoot.types';

const testData = {
  email: 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo@pubky.app',
  userName: 'Test User',
  baseUrl: 'https://chatwoot.example.com',
  apiAccessToken: 'test-token',
  accountId: '123',
  contactId: 456,
  sourceId: 'source-123',
  inboxId: 26,
};

const createMockContact = (overrides: Partial<TChatwootContact> = {}): TChatwootContact => ({
  id: testData.contactId,
  email: testData.email,
  name: testData.userName,
  contact_inboxes: [
    {
      source_id: testData.sourceId,
    },
  ],
  ...overrides,
});

/**
 * Creates a mock Response object compatible with safeFetch/parseResponseOrThrow
 */
const createMockResponse = (
  ok: boolean,
  data?: unknown,
  status = ok ? 200 : 500,
  statusText = ok ? 'OK' : 'Internal Server Error',
): Response =>
  mockResponse({
    ok,
    status,
    statusText,
    text: vi.fn().mockResolvedValue(data ? JSON.stringify(data) : ''),
    json: vi.fn().mockResolvedValue(data),
    headers: asOpaque<Headers>({
      get: vi.fn().mockReturnValue(null),
    }),
  });

describe('ChatwootService', () => {
  let ChatwootService: typeof import('./chatwoot').ChatwootService;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Mock global fetch
    global.fetch = vi.fn();

    // Import ChatwootService
    const chatwootModule = await import('./chatwoot');
    ChatwootService = chatwootModule.ChatwootService;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createOrFindContact', () => {
    it('should return existing contact when found by email', async () => {
      const existingContact = createMockContact();
      const searchResponse: TChatwootContactSearchResponse = {
        payload: [existingContact],
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(createMockResponse(true, searchResponse));

      const result = await ChatwootService.createOrFindContact(testData.email, testData.userName, testData.inboxId);

      expect(result).toEqual(existingContact);
      // Should only call search, not create
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/contacts/search'),
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            api_access_token: testData.apiAccessToken,
          }),
        }),
      );
    });

    it('should create new contact when not found', async () => {
      const searchResponse: TChatwootContactSearchResponse = { payload: [] };
      const newContact = createMockContact();
      const createResponse: TChatwootCreateContactResponse = {
        payload: { contact: newContact },
      };

      (global.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(createMockResponse(true, searchResponse))
        .mockResolvedValueOnce(createMockResponse(true, createResponse));

      const result = await ChatwootService.createOrFindContact(testData.email, testData.userName, testData.inboxId);

      expect(result).toEqual(newContact);
      // Should call search and then create
      expect(global.fetch).toHaveBeenCalledTimes(2);

      // Verify contact creation
      expect(global.fetch).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('/contacts'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            inbox_id: testData.inboxId,
            name: testData.userName,
            email: testData.email,
          }),
        }),
      );
    });

    it('should handle case-insensitive email matching in contact search', async () => {
      const existingContact = createMockContact({
        email: testData.email.toUpperCase(),
      });
      const searchResponse: TChatwootContactSearchResponse = {
        payload: [existingContact],
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(createMockResponse(true, searchResponse));

      const result = await ChatwootService.createOrFindContact(testData.email, testData.userName, testData.inboxId);

      // Should use existing contact despite case difference
      expect(result).toEqual(existingContact);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should throw AppError when contact search fails', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        createMockResponse(false, null, 500, 'Internal Server Error'),
      );

      await expect(
        ChatwootService.createOrFindContact(testData.email, testData.userName, testData.inboxId),
      ).rejects.toThrow();
    });

    it('should throw AppError when contact creation fails', async () => {
      const searchResponse: TChatwootContactSearchResponse = { payload: [] };

      (global.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(createMockResponse(true, searchResponse))
        .mockResolvedValueOnce(createMockResponse(false, null, 400, 'Bad Request'));

      await expect(
        ChatwootService.createOrFindContact(testData.email, testData.userName, testData.inboxId),
      ).rejects.toThrow();
    });

    it('should throw AppError when environment variables are missing', async () => {
      // Override the Env values to undefined to test service validation
      const mockEnv = await import('@/libs/env');
      const originalValues = {
        BASE_URL_SUPPORT: mockEnv.Env.BASE_URL_SUPPORT,
        SUPPORT_API_ACCESS_TOKEN: mockEnv.Env.SUPPORT_API_ACCESS_TOKEN,
        SUPPORT_ACCOUNT_ID: mockEnv.Env.SUPPORT_ACCOUNT_ID,
      };

      // Override the Env values to undefined
      asOpaque<{ BASE_URL_SUPPORT?: string }>(mockEnv.Env).BASE_URL_SUPPORT = undefined;
      asOpaque<{ SUPPORT_API_ACCESS_TOKEN?: string }>(mockEnv.Env).SUPPORT_API_ACCESS_TOKEN = undefined;
      asOpaque<{ SUPPORT_ACCOUNT_ID?: string }>(mockEnv.Env).SUPPORT_ACCOUNT_ID = undefined;

      await expect(
        ChatwootService.createOrFindContact(testData.email, testData.userName, testData.inboxId),
      ).rejects.toThrow('Missing required Chatwoot environment variables');

      // Restore original values
      asOpaque<{ BASE_URL_SUPPORT: string }>(mockEnv.Env).BASE_URL_SUPPORT = originalValues.BASE_URL_SUPPORT!;
      asOpaque<{ SUPPORT_API_ACCESS_TOKEN: string }>(mockEnv.Env).SUPPORT_API_ACCESS_TOKEN =
        originalValues.SUPPORT_API_ACCESS_TOKEN!;
      asOpaque<{ SUPPORT_ACCOUNT_ID: string }>(mockEnv.Env).SUPPORT_ACCOUNT_ID = originalValues.SUPPORT_ACCOUNT_ID!;
    });
  });

  describe('createConversation', () => {
    it('should create conversation with provided content', async () => {
      const content =
        'Report Post - Personal Info Leak\n\nPost URL: https://example.com/post/123\n\nReason: Contains my personal data';

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(createMockResponse(true));

      await ChatwootService.createConversation(testData.sourceId, testData.contactId, testData.inboxId, content);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/conversations'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            source_id: testData.sourceId,
            inbox_id: testData.inboxId,
            contact_id: testData.contactId,
            message: { content, message_type: 'incoming' },
          }),
        }),
      );
    });

    it('should throw AppError when conversation creation fails', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        createMockResponse(false, null, 500, 'Internal Server Error'),
      );

      await expect(
        ChatwootService.createConversation(testData.sourceId, testData.contactId, testData.inboxId, 'Test content'),
      ).rejects.toThrow();
    });

    it('should throw AppError when environment variables are missing', async () => {
      // Override the Env values to undefined to test service validation
      const mockEnv = await import('@/libs/env');
      const originalValues = {
        BASE_URL_SUPPORT: mockEnv.Env.BASE_URL_SUPPORT,
        SUPPORT_API_ACCESS_TOKEN: mockEnv.Env.SUPPORT_API_ACCESS_TOKEN,
        SUPPORT_ACCOUNT_ID: mockEnv.Env.SUPPORT_ACCOUNT_ID,
      };

      // Override the Env values to undefined
      asOpaque<{ BASE_URL_SUPPORT?: string }>(mockEnv.Env).BASE_URL_SUPPORT = undefined;
      asOpaque<{ SUPPORT_API_ACCESS_TOKEN?: string }>(mockEnv.Env).SUPPORT_API_ACCESS_TOKEN = undefined;
      asOpaque<{ SUPPORT_ACCOUNT_ID?: string }>(mockEnv.Env).SUPPORT_ACCOUNT_ID = undefined;

      await expect(
        ChatwootService.createConversation(testData.sourceId, testData.contactId, testData.inboxId, 'Test content'),
      ).rejects.toThrow('Missing required Chatwoot environment variables');

      // Restore original values
      asOpaque<{ BASE_URL_SUPPORT: string }>(mockEnv.Env).BASE_URL_SUPPORT = originalValues.BASE_URL_SUPPORT!;
      asOpaque<{ SUPPORT_API_ACCESS_TOKEN: string }>(mockEnv.Env).SUPPORT_API_ACCESS_TOKEN =
        originalValues.SUPPORT_API_ACCESS_TOKEN!;
      asOpaque<{ SUPPORT_ACCOUNT_ID: string }>(mockEnv.Env).SUPPORT_ACCOUNT_ID = originalValues.SUPPORT_ACCOUNT_ID!;
    });
  });
});
