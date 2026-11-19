import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LockAccessLabel } from './LockAccessLabel';

describe('LockAccessLabel', () => {
  it("labels the creator's own lock with the lock icon", () => {
    const { container } = render(<LockAccessLabel isOwnLock />);

    expect(screen.getByText('My locked content')).toHaveAttribute('data-cy', 'locked-post-access-label');
    expect(container.querySelector('svg')).toHaveClass('lucide-lock');
  });

  it('labels a lock the reader unlocked with the check icon', () => {
    const { container } = render(<LockAccessLabel isOwnLock={false} />);

    expect(screen.getByText('Unlocked')).toHaveAttribute('data-cy', 'locked-post-access-label');
    expect(container.querySelector('svg')).toHaveClass('lucide-check');
  });
});
