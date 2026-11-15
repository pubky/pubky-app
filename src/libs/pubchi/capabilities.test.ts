import { describe, expect, it } from 'vitest';
import {
  APP_SIGNIN_CAPABILITIES,
  capabilitiesCoverPubchiWrite,
  PUBCHI_PRIVATE_DIRECTORY,
  sessionCovers,
} from './capabilities';

describe('capabilitiesCoverPubchiWrite', () => {
  it('accepts root /:rw (keypair session mint)', () => {
    expect(capabilitiesCoverPubchiWrite(['/:rw'])).toBe(true);
    expect(sessionCovers(['/:rw'], PUBCHI_PRIVATE_DIRECTORY)).toBe(true);
  });

  it('accepts /pub/:rw', () => {
    expect(capabilitiesCoverPubchiWrite(['/pub/:rw'])).toBe(true);
  });

  it('accepts /pub/app.pubchi/v1/:rw', () => {
    expect(capabilitiesCoverPubchiWrite(['/pub/app.pubchi/v1/:rw'])).toBe(true);
  });

  it('accepts write-only /pub/app.pubchi/v1/:w (SDK CapabilityAction includes w)', () => {
    expect(capabilitiesCoverPubchiWrite(['/pub/app.pubchi/v1/:w'])).toBe(true);
  });

  it('rejects Ring default /pub/pubky.app/:rw', () => {
    expect(capabilitiesCoverPubchiWrite(['/pub/pubky.app/:rw'])).toBe(false);
  });

  it('rejects near-miss scopes that share a string prefix but not a path segment', () => {
    expect(capabilitiesCoverPubchiWrite(['/pub/app.pubchi/v1.evil/:rw'])).toBe(false);
    expect(capabilitiesCoverPubchiWrite(['/pub/app.pubchi/v1foo/:rw'])).toBe(false);
  });

  it('rejects a read-only capability over a covering scope', () => {
    expect(capabilitiesCoverPubchiWrite(['/:r'])).toBe(false);
    expect(capabilitiesCoverPubchiWrite(['/pub/:r'])).toBe(false);
    expect(capabilitiesCoverPubchiWrite(['/pub/app.pubchi/v1/:r'])).toBe(false);
  });

  it('rejects a file-scope grant of the same name', () => {
    expect(capabilitiesCoverPubchiWrite(['/pub/app.pubchi/v1:rw'])).toBe(false);
  });

  it('accepts a private Pubchi directory grant and rejects read-only coverage', () => {
    expect(sessionCovers([`${PUBCHI_PRIVATE_DIRECTORY}:rw`], PUBCHI_PRIVATE_DIRECTORY)).toBe(true);
    expect(sessionCovers([`${PUBCHI_PRIVATE_DIRECTORY}:r`], PUBCHI_PRIVATE_DIRECTORY)).toBe(false);
  });
});

describe('APP_SIGNIN_CAPABILITIES', () => {
  it('requests shared social and Pubchi-owned write scopes', () => {
    expect(APP_SIGNIN_CAPABILITIES).toContain('/pub/pubky.app/:rw');
    expect(APP_SIGNIN_CAPABILITIES).toContain('/pub/app.pubchi/v1/:rw');
    expect(APP_SIGNIN_CAPABILITIES).toContain('/priv/app.pubchi/v1/:rw');
  });
});
