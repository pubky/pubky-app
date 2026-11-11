import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DialogBackupPhrase } from './DialogBackupPhrase';

// Unlike DialogBackupPhrase.test.tsx, this file renders the real `@/atoms/Dialog/Dialog`: the `sentry-block` class only
// protects production if the atom forwards the consumer `className` onto the rendered dialog element.
vi.mock('@/stores/onboarding/onboarding.store', () => ({
  useOnboardingStore: () => ({
    secretKey: 'mock-secret-key',
    mnemonic: 'tube tube resource mass door firm genius parrot girl orphan window world',
  }),
}));

describe('DialogBackupPhrase - sentry-block on the real Dialog atom', () => {
  it('puts sentry-block on the rendered dialog element', () => {
    render(<DialogBackupPhrase />);

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByRole('dialog')).toHaveClass('sentry-block');
  });
});
