import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { DialogConfirmBackup } from './DialogConfirmBackup';

// Mock dependencies
vi.mock('@/stores/onboarding/onboarding.store', () => ({
  useOnboardingStore: vi.fn(() => ({
    clearSecrets: vi.fn(),
  })),
}));

// Mock atoms - use actual implementations
vi.mock('@/atoms', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/atoms')>();
  return {
    ...actual,
  };
});

// Mock organisms
vi.mock('@/organisms', () => ({
  DialogBackup: vi.fn(() => <div data-testid="dialog-backup">DialogBackup</div>),
}));

describe('DialogConfirmBackup - Snapshot', () => {
  it('matches snapshot for default DialogConfirmBackup', () => {
    const { container } = render(<DialogConfirmBackup />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
