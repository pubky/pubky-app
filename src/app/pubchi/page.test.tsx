import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PubchiProfile } from '@/templates/Pubchi/PubchiProfile/PubchiProfile';
import PubchiPage from './page';

const mocks = vi.hoisted(() => ({
  isPubchiEnabled: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock('@/libs/pubchi/flags', () => ({
  isPubchiEnabled: mocks.isPubchiEnabled,
}));

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
}));

vi.mock('@/templates/Pubchi/PubchiProfile/PubchiProfile', () => ({
  PubchiProfile: () => <div data-testid="pubchi-profile" />,
}));

describe('Pubchi page', () => {
  beforeEach(() => {
    mocks.isPubchiEnabled.mockReset();
    mocks.redirect.mockReset();
  });

  it('redirects home when Pubchi is disabled', () => {
    mocks.isPubchiEnabled.mockReturnValue(false);

    PubchiPage();

    expect(mocks.redirect).toHaveBeenCalledWith('/home');
  });

  it('renders the profile when Pubchi is enabled', () => {
    mocks.isPubchiEnabled.mockReturnValue(true);

    expect(PubchiPage()).toEqual(<PubchiProfile />);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
