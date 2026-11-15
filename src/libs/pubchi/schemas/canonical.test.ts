import { describe, expect, it } from 'vitest';
import { bodySha256, canonicalJson, sha256Hex } from './canonical';
import { unsignedDelegationBytes, type UnsignedDeviceDelegationV1 } from './delegation';

/**
 * Hex pins from @pubky/pubchi-schemas in pubky-ai-bot-w3 @ d777c56
 * (`packages/pubchi-schemas/src/canonical.ts` via `npx tsx -e`).
 * Service `bodySha256(undefined)` hashes `null`.
 */
const SERVICE_BODYLESS_SHA256 = '74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b';
const SERVICE_BEARING_SHA256 = '4ef88c8a0a4b936a32f4eb9ed6f59be372627c44733e68417dae104d78ad63ea';
const SERVICE_BODYLESS_REQUEST_SHA256 = '0e5cceadc8d91dc0388477c3419da4e4d7810014ff13b6b99af27e8f733dea65';
const SERVICE_BEARING_REQUEST_SHA256 = 'bfaf67e837575ce8ccda83a213a356e5d51520f248ca59cd3e8ec10472952428';
const SIGNER = 'cccccccccccccccccccccccccccccccccccccccccccccccccccc';
const SERVICE_SIGNER_REQUEST_SHA256 = '866b16caf82e3189024b932089055c6b4a40d6608d1da831f42d64debadd0ceb';
const SERVICE_DELEGATION_SHA256 = '851f03755bc8efc70ed70a3fb2e45df27476b4b52ac83fa858e8f6b1960817cd';

const ASKER = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const BOT = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const NONCE = '0000000000000000000000000000000000000000000000000000000000000000';
const ISSUED_AT = 1_788_600_000;
const EXPIRES_AT = 1_788_600_600;
const BEARING_BODY = { question: 'Who tagged me?' };

const SERVICE_BODYLESS_REQUEST_JSON =
  '{"asker":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","body_sha256":"74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b","bot":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","expires_at":1788600600,"issued_at":1788600000,"nonce":"0000000000000000000000000000000000000000000000000000000000000000","purpose":"who-tagged-me","schema":"pubchi-request-object","version":1}';
const SERVICE_BEARING_REQUEST_JSON =
  '{"asker":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","body_sha256":"4ef88c8a0a4b936a32f4eb9ed6f59be372627c44733e68417dae104d78ad63ea","bot":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","expires_at":1788600600,"issued_at":1788600000,"nonce":"0000000000000000000000000000000000000000000000000000000000000000","purpose":"build-feed","schema":"pubchi-request-object","version":1}';

function requestObject(purpose: 'who-tagged-me' | 'build-feed', bodySha: string) {
  return {
    schema: 'pubchi-request-object',
    version: 1,
    asker: ASKER,
    bot: BOT,
    purpose,
    body_sha256: bodySha,
    issued_at: ISSUED_AT,
    expires_at: EXPIRES_AT,
    nonce: NONCE,
  };
}

describe('pubchi request canonical form (service wire)', () => {
  it('pins a body-less request to the service hash of null', async () => {
    // Service: bodySha256(undefined) === bodySha256(null). The App never omits
    // body on the wire; this pins the service's missing-body interpretation.
    const bodyHash = await bodySha256(null);
    expect(bodyHash).toBe(SERVICE_BODYLESS_SHA256);

    const unsigned = requestObject('who-tagged-me', bodyHash);
    expect(canonicalJson(unsigned)).toBe(SERVICE_BODYLESS_REQUEST_JSON);
    expect(await sha256Hex(canonicalJson(unsigned))).toBe(SERVICE_BODYLESS_REQUEST_SHA256);
  });

  it('pins a body-bearing request the App actually sends', async () => {
    const bodyHash = await bodySha256(BEARING_BODY);
    expect(bodyHash).toBe(SERVICE_BEARING_SHA256);

    const unsigned = requestObject('build-feed', bodyHash);
    expect(canonicalJson(unsigned)).toBe(SERVICE_BEARING_REQUEST_JSON);
    expect(await sha256Hex(canonicalJson(unsigned))).toBe(SERVICE_BEARING_REQUEST_SHA256);
  });

  it('pins signer-bearing requests and device delegations to service bytes', async () => {
    const request = requestObject('build-feed', SERVICE_BEARING_SHA256);
    const signerRequest = { ...request, signer: SIGNER };
    expect(await sha256Hex(canonicalJson(signerRequest))).toBe(SERVICE_SIGNER_REQUEST_SHA256);

    const delegation: UnsignedDeviceDelegationV1 = {
      schema: 'pubchi-device-delegation',
      version: 1,
      owner: ASKER,
      signer: SIGNER,
      bot: BOT,
      purposes: ['who-tagged-me', 'build-feed', 'what-i-missed', 'summarize'],
      created_at: ISSUED_AT,
      expires_at: 1_791_192_000,
    };
    expect(await sha256Hex(unsignedDelegationBytes(delegation))).toBe(SERVICE_DELEGATION_SHA256);
  });
});
