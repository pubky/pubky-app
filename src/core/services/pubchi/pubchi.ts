import { AppError } from '@/libs/error/error';
import {
  ClientErrorCode,
  NetworkErrorCode,
  ServerErrorCode,
  TimeoutErrorCode,
  ValidationErrorCode,
} from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { safeFetch } from '@/libs/error/error.http';
import { ErrorService } from '@/libs/error/error.types';
import { extractPubchiErrorCode, pubchiClientError, pubchiValidationError } from '@/libs/pubchi/errors';
import { getPubchiUrlFor, isPubchiPanelEnabled } from '@/libs/pubchi/flags';
import type { PubchiQueryRequest } from '@/services/pubchi/pubchi.types';

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RESPONSE_BYTES = 256_000;

export class PubchiService {
  private constructor() {}

  /**
   * POST a signed request to the Pubchi gateway. HTTP only: no validation,
   * no Dexie, no stores.
   */
  static async query(payload: PubchiQueryRequest): Promise<unknown> {
    if (!isPubchiPanelEnabled()) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'PUBCHI_DISABLED', {
        service: ErrorService.Pubchi,
        operation: 'query',
      });
    }

    const url = getPubchiUrlFor(payload.request.purpose);
    if (!url) {
      throw pubchiValidationError('PURPOSE_UNSUPPORTED', 'query');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await safeFetch(
        url,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify(payload),
          credentials: 'omit',
          redirect: 'error',
          signal: controller.signal,
        },
        ErrorService.Pubchi,
        'query',
      );

      const raw = await readLimitedBody(response);
      const parsed = parseJsonOrUndefined(raw);

      if (!response.ok) {
        const code = extractPubchiErrorCode(parsed);
        if (code) throw pubchiClientError(code, 'query');
        if (response.status >= 500) {
          throw Err.server(ServerErrorCode.SERVICE_UNAVAILABLE, 'PUBCHI_UNAVAILABLE', {
            service: ErrorService.Pubchi,
            operation: 'query',
            context: { statusCode: response.status },
          });
        }
        throw Err.client(ClientErrorCode.BAD_REQUEST, 'SCHEMA_INVALID', {
          service: ErrorService.Pubchi,
          operation: 'query',
          context: { statusCode: response.status },
        });
      }

      if (parsed === undefined) {
        throw Err.server(ServerErrorCode.INVALID_RESPONSE, 'SCHEMA_INVALID', {
          service: ErrorService.Pubchi,
          operation: 'query',
        });
      }

      return parsed;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw Err.timeout(TimeoutErrorCode.REQUEST_TIMEOUT, 'REQUEST_TIMEOUT', {
          service: ErrorService.Pubchi,
          operation: 'query',
        });
      }
      if (error instanceof AppError) {
        throw error;
      }
      throw Err.network(NetworkErrorCode.CONNECTION_FAILED, 'CONNECTION_FAILED', {
        service: ErrorService.Pubchi,
        operation: 'query',
        cause: error,
      });
    } finally {
      clearTimeout(timer);
    }
  }
}

async function readLimitedBody(response: Response): Promise<string> {
  const lengthHeader = response.headers.get('content-length');
  if (lengthHeader && Number(lengthHeader) > MAX_RESPONSE_BYTES) {
    throw Err.client(ClientErrorCode.PAYLOAD_TOO_LARGE, 'SCHEMA_INVALID', {
      service: ErrorService.Pubchi,
      operation: 'query',
    });
  }
  const text = await response.text();
  if (new TextEncoder().encode(text).length > MAX_RESPONSE_BYTES) {
    throw Err.client(ClientErrorCode.PAYLOAD_TOO_LARGE, 'SCHEMA_INVALID', {
      service: ErrorService.Pubchi,
      operation: 'query',
    });
  }
  return text;
}

function parseJsonOrUndefined(raw: string): unknown {
  if (raw.trim() === '') return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}
