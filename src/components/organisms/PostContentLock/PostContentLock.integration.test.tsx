import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PostContentLock } from './PostContentLock';

// Only PostText is stubbed (it pulls in next/navigation + react-markdown).
// usePostLock, useLockFile, LocksController, and the LockContentParser pipe all
// run for real, so this exercises the actual "bad lock URL -> graceful degrade"
// path end to end (controller throws Err.validation, hook catches, UI degrades).
vi.mock('@/molecules/PostText/PostText', () => ({
  PostText: ({ content }: { content: string }) => <p>{content}</p>,
}));

const TEASER_CONTENT = JSON.stringify({
  lock_title: 'Private Key Management',
  teaser_description: 'Something, something, not your cheese.',
});

describe('PostContentLock — invalid lock URL does not block the post', () => {
  it('still renders the post and shows an unavailable message instead of crashing', async () => {
    // Rendering must not throw even though the top-level lock URL is malformed.
    render(<PostContentLock content={TEASER_CONTENT} lock="https://not-a-pubky-homeserver.example/lock.json" />);

    // The teaser content itself stays on screen (the bad lock URL never blocks it).
    expect(screen.getByText('Private Key Management')).toBeInTheDocument();
    expect(screen.getByText('Something, something, not your cheese.')).toBeInTheDocument();

    // Real hook -> real controller rejects (Err.validation) -> graceful message.
    await waitFor(() => expect(screen.getByText('Lock content is not available')).toBeInTheDocument());

    // No broken interactive leftovers: the Unlock control and password indicator
    // are removed rather than left dangling/disabled.
    expect(screen.queryByRole('button', { name: /unlock/i })).not.toBeInTheDocument();
    expect(screen.queryByText('••••••')).not.toBeInTheDocument();
  });

  // TODO:[Locks] #2083 — this asserts scaffold behavior only: the fetch is a stub that
  // returns null for a valid URL, so the control is gated solely on `hasError`. Once #2083
  // wires the real `lock.json` read, the unlock control must also depend on a loaded
  // `lockFile` + resolved `verifierType` — update this test (and the gating) then.
  it('keeps the unlock control interactive for a valid lock (sanity: error path is the only blocker)', async () => {
    render(
      <PostContentLock
        content={TEASER_CONTENT}
        lock="pubky://qr3xqyz3e5cyf9npgxc5zfp15ehhcis6gqsxob4une7bwwazekry/pub/locks/lock.json"
      />,
    );

    // Valid URL -> no validation error -> Unlock control stays (the fetch is a stub
    // that returns null today; the error path is the only thing that removes the control).
    await waitFor(() => expect(screen.getByRole('button', { name: /unlock/i })).toBeEnabled());
    expect(screen.queryByText('Lock content is not available')).not.toBeInTheDocument();
  });
});
