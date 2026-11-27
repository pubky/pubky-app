import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalIndexManager } from './LocalIndexManager';

const coordinator = vi.hoisted(() => ({ start: vi.fn(), stop: vi.fn() }));

vi.mock('@/coordinators/indexer/indexer', () => ({ IndexerCoordinator: { getInstance: () => coordinator } }));

describe('LocalIndexManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts the local index coordinator on mount and stops it on unmount', () => {
    const { unmount } = render(<LocalIndexManager />);
    expect(coordinator.start).toHaveBeenCalledOnce();
    expect(coordinator.stop).not.toHaveBeenCalled();

    unmount();
    expect(coordinator.stop).toHaveBeenCalledOnce();
  });
});
