import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PASSPORT_RETURN_MESSAGE_TYPE } from '@/config/passport';
import { PassportReturn } from './PassportReturn';

const originalLocation = window.location;
const originalOpener = window.opener;

function setLocation(search: string) {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...originalLocation, search, origin: 'https://app.example.com' },
  });
}

function setOpener(opener: { closed: boolean; postMessage: ReturnType<typeof vi.fn> } | null) {
  Object.defineProperty(window, 'opener', { configurable: true, value: opener });
}

describe('PassportReturn', () => {
  let closeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    closeSpy = vi.spyOn(window, 'close').mockImplementation(() => undefined);
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
    Object.defineProperty(window, 'opener', { configurable: true, value: originalOpener });
    vi.restoreAllMocks();
  });

  it('relays a valid outcome to the opener on the same origin, closes, and still renders the return link', () => {
    const opener = { closed: false, postMessage: vi.fn() };
    setOpener(opener);
    setLocation('?attempt=attempt-1&outcome=success');

    const { container } = render(<PassportReturn />);

    expect(opener.postMessage).toHaveBeenCalledWith(
      { type: PASSPORT_RETURN_MESSAGE_TYPE, attemptId: 'attempt-1', outcome: 'success' },
      'https://app.example.com',
    );
    expect(closeSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('passport-return-link')).toHaveAttribute('href', '/');
    expect(container).toMatchSnapshot();
  });

  it('renders only the return link when there is no opener', () => {
    setOpener(null);
    setLocation('?attempt=attempt-1&outcome=cancel');

    render(<PassportReturn />);

    expect(closeSpy).not.toHaveBeenCalled();
    expect(screen.getByText('You can close this window and return to Pubky to continue.')).toBeInTheDocument();
    expect(screen.getByTestId('passport-return-link')).toBeInTheDocument();
  });

  it('does not post anything for a malformed or unknown outcome', () => {
    const opener = { closed: false, postMessage: vi.fn() };
    setOpener(opener);
    setLocation('?attempt=attempt-1&outcome=signed-in');

    render(<PassportReturn />);

    expect(opener.postMessage).not.toHaveBeenCalled();
    expect(closeSpy).not.toHaveBeenCalled();
    expect(screen.getByTestId('passport-return-link')).toBeInTheDocument();
  });

  it('does not post to a closed opener', () => {
    const opener = { closed: true, postMessage: vi.fn() };
    setOpener(opener);
    setLocation('?attempt=attempt-1&outcome=error');

    render(<PassportReturn />);

    expect(opener.postMessage).not.toHaveBeenCalled();
    expect(screen.getByTestId('passport-return-link')).toBeInTheDocument();
  });
});
