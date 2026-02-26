import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCopyrightForm } from './useCopyrightForm';

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
    it('should initialize with correct default values', () => {
      const { result } = renderHook(() => useCopyrightForm());
      const values = result.current.form.getValues();

      expect(values.isRightsOwner).toBe(true);
      expect(values.isReportingOnBehalf).toBe(false);
      expect(values.nameOwner).toBe('');
      expect(values.email).toBe('');
      expect(result.current.form.formState.isSubmitting).toBe(false);
    });
  });

  describe('handleRoleChange', () => {
    it('should handle mutual exclusion for role checkboxes', () => {
      const { result } = renderHook(() => useCopyrightForm());

      expect(result.current.form.getValues('isRightsOwner')).toBe(true);
      expect(result.current.form.getValues('isReportingOnBehalf')).toBe(false);

      act(() => {
        result.current.handleRoleChange('isReportingOnBehalf', true);
      });

      expect(result.current.form.getValues('isRightsOwner')).toBe(false);
      expect(result.current.form.getValues('isReportingOnBehalf')).toBe(true);

      act(() => {
        result.current.handleRoleChange('isRightsOwner', true);
      });

      expect(result.current.form.getValues('isRightsOwner')).toBe(true);
      expect(result.current.form.getValues('isReportingOnBehalf')).toBe(false);
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

    it('should not submit when role validation fails', async () => {
      const { result } = renderHook(() => useCopyrightForm());

      // Fill all required fields but uncheck both role checkboxes
      act(() => {
        Object.entries(validFormData).forEach(([key, value]) => {
          result.current.form.setValue(key as keyof typeof validFormData, value);
        });
        result.current.handleRoleChange('isRightsOwner', false);
      });

      await act(async () => {
        await result.current.onSubmit();
      });

      // Should not call fetch because role validation fails
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
    it('should submit form with valid data', async () => {
      const { result } = renderHook(() => useCopyrightForm());

      act(() => {
        Object.entries(validFormData).forEach(([key, value]) => {
          result.current.form.setValue(key as keyof typeof validFormData, value);
        });
      });

      await act(async () => {
        await result.current.onSubmit();
      });

      expect(global.fetch).toHaveBeenCalledWith('/api/copyright', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.stringContaining('"nameOwner":"John Doe"'),
      });
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

    it('should reset form after successful submission', async () => {
      const { result } = renderHook(() => useCopyrightForm());

      act(() => {
        Object.entries(validFormData).forEach(([key, value]) => {
          result.current.form.setValue(key as keyof typeof validFormData, value);
        });
      });

      expect(result.current.form.getValues('nameOwner')).toBe('John Doe');

      await act(async () => {
        await result.current.onSubmit();
      });

      expect(result.current.form.getValues('nameOwner')).toBe('');
      expect(result.current.form.getValues('isRightsOwner')).toBe(true);
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
