import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DialogInstallIos } from './DialogInstallIos';

describe('DialogInstallIos', () => {
  it('lists the two Add-to-Home-Screen steps', () => {
    render(<DialogInstallIos open onOpenChange={vi.fn()} onConfirm={vi.fn()} />);

    expect(screen.getByRole('dialog', { name: 'Install Pubky' })).toBeInTheDocument();
    expect(screen.getByText('Tap the Share button in your browser toolbar')).toBeInTheDocument();
    expect(screen.getByText("Tap 'Add to Home Screen'")).toBeInTheDocument();
  });

  it('confirms on Got it', () => {
    const onConfirm = vi.fn();
    render(<DialogInstallIos open onOpenChange={vi.fn()} onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('renders nothing while closed', () => {
    render(<DialogInstallIos open={false} onOpenChange={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('DialogInstallIos - Snapshots', () => {
  it('matches snapshot when open', () => {
    const { baseElement } = render(<DialogInstallIos open onOpenChange={vi.fn()} onConfirm={vi.fn()} />);
    expect(baseElement).toMatchSnapshot();
  });
});
