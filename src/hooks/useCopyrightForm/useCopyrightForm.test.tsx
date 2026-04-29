import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { asInvalid } from '@/test-utils/type-assertions';
import { useCopyrightForm } from './useCopyrightForm';
import { COPYRIGHT_ROLES } from './useCopyrightForm.constants';

const mockToast = vi.fn();
const mockShowErrorToast = vi.fn();
vi.mock('@/molecules', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/molecules')>();
  return {
    ...actual,
    toast: (...args: unknown[]) => mockToast(...args),
    showErrorToast: (params: { title?: string; description: string }) => mockShowErrorToast(params),
  };
});

global.fetch = vi.fn();

const validFormData = {
  nameOwner: 'John Doe',
  originalContentUrls: 'https://example.com/original',
  briefDescription: 'My original artwork',
  infringingContentUrl: 'https://example.com/infringing',
  firstName: 'John',
  lastName: 'Doe',
  email: 'john@example.com',
  phoneNumber: '123-456-7890',
  streetAddress: '123 Main St',
  country: 'United States',
  city: 'New York',
  stateProvince: 'NY',
  zipCode: '10001',
  signature: 'John Doe',
};

describe('useCopyrightForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ message: 'Success' }),
    } as Response);
  });

  describe('initial state', () => {
    it('should initialize with rights_owner role selected by default', () => {
      const { result } = renderHook(() => useCopyrightForm());
      const values = result.current.form.getValues();

      expect(values.role).toBe(COPYRIGHT_ROLES.RIGHTS_OWNER);
      expect(values.nameOwner).toBe('');
      expect(values.email).toBe('');
      expect(result.current.form.formState.isSubmitting).toBe(false);
    });
  });

  describe('validation', () => {
    it('should not call fetch when validation fails', async () => {
      const { result } = renderHook(() => useCopyrightForm());

      await act(async () => {
        await result.current.onSubmit();
      });

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should not submit when role is unset', async () => {
      const { result } = renderHook(() => useCopyrightForm());

      // Fill all required fields, then clear the role to trigger role validation failure
      act(() => {
        Object.entries(validFormData).forEach(([key, value]) => {
          result.current.form.setValue(key as keyof typeof validFormData, value);
        });
        // Cast undefined to bypass enum-typing — we're explicitly testing the unset case
        result.current.form.setValue(
          'role',
          asInvalid<(typeof COPYRIGHT_ROLES)[keyof typeof COPYRIGHT_ROLES]>(undefined),
        );
      });

      await act(async () => {
        await result.current.onSubmit();
      });

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should validate phone number format', async () => {
      const { result } = renderHook(() => useCopyrightForm());

      act(() => {
        Object.entries(validFormData).forEach(([key, value]) => {
          result.current.form.setValue(key as keyof typeof validFormData, value);
        });
        result.current.form.setValue('phoneNumber', 'invalid@phone');
      });

      await act(async () => {
        await result.current.onSubmit();
      });

      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('form submission', () => {
    it('should derive isRightsOwner=true / isReportingOnBehalf=false in payload when role=rights_owner', async () => {
      const { result } = renderHook(() => useCopyrightForm());

      act(() => {
        Object.entries(validFormData).forEach(([key, value]) => {
          result.current.form.setValue(key as keyof typeof validFormData, value);
        });
        result.current.form.setValue('role', COPYRIGHT_ROLES.RIGHTS_OWNER);
      });

      await act(async () => {
        await result.current.onSubmit();
      });

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [, init] = vi.mocked(global.fetch).mock.calls[0]!;
      const body = JSON.parse((init as RequestInit).body as string);
      expect(body.isRightsOwner).toBe(true);
      expect(body.isReportingOnBehalf).toBe(false);
      expect(body.role).toBeUndefined();
      expect(body.nameOwner).toBe('John Doe');
    });

    it('should derive isRightsOwner=false / isReportingOnBehalf=true in payload when role=reporting_on_behalf', async () => {
      const { result } = renderHook(() => useCopyrightForm());

      act(() => {
        Object.entries(validFormData).forEach(([key, value]) => {
          result.current.form.setValue(key as keyof typeof validFormData, value);
        });
        result.current.form.setValue('role', COPYRIGHT_ROLES.REPORTING_ON_BEHALF);
      });

      await act(async () => {
        await result.current.onSubmit();
      });

      const [, init] = vi.mocked(global.fetch).mock.calls[0]!;
      const body = JSON.parse((init as RequestInit).body as string);
      expect(body.isRightsOwner).toBe(false);
      expect(body.isReportingOnBehalf).toBe(true);
    });

    it('should show success toast on successful submission', async () => {
      const { result } = renderHook(() => useCopyrightForm());

      act(() => {
        Object.entries(validFormData).forEach(([key, value]) => {
          result.current.form.setValue(key as keyof typeof validFormData, value);
        });
      });

      await act(async () => {
        await result.current.onSubmit();
      });

      expect(mockToast).toHaveBeenCalledWith({
        title: 'Success',
        description: 'Request sent successfully',
      });
    });

    it('should show error toast on failed submission', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Validation failed' }),
      } as Response);

      const { result } = renderHook(() => useCopyrightForm());

      act(() => {
        Object.entries(validFormData).forEach(([key, value]) => {
          result.current.form.setValue(key as keyof typeof validFormData, value);
        });
      });

      await act(async () => {
        await result.current.onSubmit();
      });

      expect(mockShowErrorToast).toHaveBeenCalledWith({
        description: 'Validation failed',
      });
    });

    it('should reset form (and restore default role) after successful submission', async () => {
      const { result } = renderHook(() => useCopyrightForm());

      act(() => {
        Object.entries(validFormData).forEach(([key, value]) => {
          result.current.form.setValue(key as keyof typeof validFormData, value);
        });
        result.current.form.setValue('role', COPYRIGHT_ROLES.REPORTING_ON_BEHALF);
      });

      expect(result.current.form.getValues('nameOwner')).toBe('John Doe');

      await act(async () => {
        await result.current.onSubmit();
      });

      expect(result.current.form.getValues('nameOwner')).toBe('');
      expect(result.current.form.getValues('role')).toBe(COPYRIGHT_ROLES.RIGHTS_OWNER);
    });

    it('should handle network errors gracefully', async () => {
      vi.mocked(global.fetch).mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useCopyrightForm());

      act(() => {
        Object.entries(validFormData).forEach(([key, value]) => {
          result.current.form.setValue(key as keyof typeof validFormData, value);
        });
      });

      await act(async () => {
        await result.current.onSubmit();
      });

      expect(mockShowErrorToast).toHaveBeenCalledWith({
        description: 'Network error',
      });
    });
  });
});
