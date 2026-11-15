import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { getPubchiApiUrl } from '@/libs/runtime-config/runtime-config';

export function normalizePubchiAudience(apiUrl: string): string {
  try {
    const url = new URL(apiUrl);
    if (['http:', 'https:'].includes(url.protocol)) return url.origin;
  } catch {
    // Do not include the supplied URL in the error telemetry.
  }
  throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Invalid Pubchi API URL', {
    service: ErrorService.Pubchi,
    operation: 'normalizePubchiAudience',
  });
}

export function getPubchiAudience(): string {
  return normalizePubchiAudience(getPubchiApiUrl().trim());
}
