import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAppBadge } from '@/hooks/useAppBadge/useAppBadge';
import { useInstallPromptLifecycle } from '@/hooks/useInstallPromptLifecycle/useInstallPromptLifecycle';
import { useNetworkStatusToasts } from '@/hooks/useNetworkStatusToasts/useNetworkStatusToasts';
import { useServiceWorkerUpdate } from '@/hooks/useServiceWorkerUpdate/useServiceWorkerUpdate';
import { PwaManager } from './PwaManager';

vi.mock('@/hooks/useAppBadge/useAppBadge', () => ({ useAppBadge: vi.fn() }));
vi.mock('@/hooks/useInstallPromptLifecycle/useInstallPromptLifecycle', () => ({
  useInstallPromptLifecycle: vi.fn(),
}));
vi.mock('@/hooks/useNetworkStatusToasts/useNetworkStatusToasts', () => ({ useNetworkStatusToasts: vi.fn() }));
vi.mock('@/hooks/useServiceWorkerUpdate/useServiceWorkerUpdate', () => ({ useServiceWorkerUpdate: vi.fn() }));

describe('PwaManager', () => {
  it('mounts every PWA lifecycle hook once and renders nothing', () => {
    const { container } = render(<PwaManager />);

    expect(useServiceWorkerUpdate).toHaveBeenCalledTimes(1);
    expect(useNetworkStatusToasts).toHaveBeenCalledTimes(1);
    expect(useAppBadge).toHaveBeenCalledTimes(1);
    expect(useInstallPromptLifecycle).toHaveBeenCalledTimes(1);
    expect(container).toBeEmptyDOMElement();
  });
});
