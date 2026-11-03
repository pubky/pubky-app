/**
 * Vendored from @pubky/pubchi-schemas (pubky-ai-bot-pubchi).
 * Source commit: bbf8a73
 * Do not redefine these contracts.
 */

import { err, type ParseResult } from './codes';
import { parsePubchiConfigV1 } from './config';
import { parseDeviceDelegationV1 } from './delegation';
import { parseCommonEnvelopeV1 } from './envelope';
import { parseFeedProposal } from './feed';
import { parseManifestV1 } from './manifest';
import { parseQueryResultV1 } from './query';
import { parseRequestBindingV1, parseRequestObjectV1 } from './request';
import { parsePubchiSuggestionV1 } from './suggestion';
import { parseOwnerBindingV1, parseTenantV1 } from './tenant';

export function parseBySchema(input: unknown): ParseResult<unknown> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return err('SCHEMA_INVALID');
  }
  const schema = (input as { schema?: unknown }).schema;
  switch (schema) {
    case 'pubchi-tenant':
      return parseTenantV1(input);
    case 'pubchi-owner-binding':
      return parseOwnerBindingV1(input);
    case 'pubchi-request':
      return parseRequestBindingV1(input);
    case 'pubchi-request-object':
      return parseRequestObjectV1(input);
    case 'pubchi-device-delegation':
      return parseDeviceDelegationV1(input);
    case 'pubchi-feed-proposal':
      return parseFeedProposal(input);
    case 'pubchi-query-result':
      return parseQueryResultV1(input);
    case 'pubchi-manifest':
      return parseManifestV1(input);
    case 'pubchi-config':
      return parsePubchiConfigV1(input);
    case 'pubchi-suggestion':
      return parsePubchiSuggestionV1(input);
    case 'pubchi-envelope':
      return parseCommonEnvelopeV1(input);
    default:
      return err('SCHEMA_INVALID');
  }
}
