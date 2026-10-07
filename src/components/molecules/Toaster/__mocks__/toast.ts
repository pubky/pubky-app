import { vi } from 'vitest';
import type { toast as toastImpl } from '../toast';

// Manual mock used by every call-site test via a bare vi.mock('@/molecules/Toaster/toast').
// Assert through vi.mocked(toast) after importing toast from the real path.
export const toast = vi.fn<typeof toastImpl>(() => ({ dismiss: vi.fn() }));
