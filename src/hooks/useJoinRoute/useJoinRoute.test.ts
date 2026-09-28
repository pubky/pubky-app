import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ONBOARDING_ROUTES } from '@/app/routes';
import { usePassportEligibility } from '@/hooks/usePassportEligibility/usePassportEligibility';
import { useJoinRoute } from './useJoinRoute';

vi.mock('@/hooks/usePassportEligibility/usePassportEligibility', () => ({
  usePassportEligibility: vi.fn(),
}));

const mockEligibility = vi.mocked(usePassportEligibility);

describe('useJoinRoute', () => {
  it('points at the Join step only once Passport is enabled', () => {
    mockEligibility.mockReturnValue('enabled');
    expect(renderHook(() => useJoinRoute()).result.current).toBe(ONBOARDING_ROUTES.JOIN);
  });

  it.each(['pending', 'disabled'] as const)('falls back to the fair-access step while %s', (eligibility) => {
    mockEligibility.mockReturnValue(eligibility);
    expect(renderHook(() => useJoinRoute()).result.current).toBe(ONBOARDING_ROUTES.HUMAN);
  });
});
