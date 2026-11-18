import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AUTH_MIGRATION_KEY,
  AUTH_PERSIST_KEY,
  LEGACY_AUTH_PERSIST_KEY,
  PREVIOUS_AUTH_MIGRATION_KEY,
  PREVIOUS_AUTH_PERSIST_KEY,
} from '@/stores/persistedKeys';
import { PublicLanding } from './PublicLanding';

function runBootstrap() {
  const view = render(
    <PublicLanding checking>
      <button>Join now</button>
    </PublicLanding>,
  );
  const script = view.container.querySelector('script')!;
  // Isolate the parser path from the ref that runs on a client navigation.
  script.removeAttribute('data-saved-account');
  vi.spyOn(document, 'currentScript', 'get').mockReturnValue(script);
  new Function(script.textContent!)();
  return { view, script };
}

function store(key: string, state: object) {
  localStorage.setItem(key, JSON.stringify({ state }));
}

describe('PublicLanding first paint', () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it.each([
    [AUTH_PERSIST_KEY, { sessionReference: { kind: 'grant' } }],
    [PREVIOUS_AUTH_PERSIST_KEY, { sessionReference: { kind: 'grant' } }],
    [LEGACY_AUTH_PERSIST_KEY, { currentUserPubky: 'member' }],
  ])('shows the gate for saved credentials in %s until the shell resolves', (key, state) => {
    store(key, state);
    const { view, script } = runBootstrap();
    expect(script).toHaveAttribute('data-saved-account');
    const button = view.getByText('Join now');
    view.rerender(
      <PublicLanding checking={false}>
        <button>Join now</button>
      </PublicLanding>,
    );
    expect(script).not.toBeInTheDocument();
    expect(view.getByText('Join now')).toBe(button);
  });

  it.each([AUTH_MIGRATION_KEY, PREVIOUS_AUTH_MIGRATION_KEY])('respects the logout marker %s', (key) => {
    store(LEGACY_AUTH_PERSIST_KEY, { currentUserPubky: 'old-member' });
    localStorage.setItem(key, '1');
    expect(runBootstrap().script).not.toHaveAttribute('data-saved-account');
  });

  it('lets a current guest record override a leftover legacy member', () => {
    store(AUTH_PERSIST_KEY, { currentUserPubky: null, sessionReference: null });
    store(LEGACY_AUTH_PERSIST_KEY, { currentUserPubky: 'old-member' });
    expect(runBootstrap().script).not.toHaveAttribute('data-saved-account');
  });

  it('leaves guest controls available on a first visit', () => {
    expect(runBootstrap().script).not.toHaveAttribute('data-saved-account');
  });

  it('leaves corrupt storage to the normal recovery path', () => {
    localStorage.setItem(AUTH_PERSIST_KEY, '{');
    expect(runBootstrap().script).not.toHaveAttribute('data-saved-account');
  });
});
