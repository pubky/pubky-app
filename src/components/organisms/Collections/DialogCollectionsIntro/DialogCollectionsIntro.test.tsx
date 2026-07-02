import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DialogCollectionsIntro } from './DialogCollectionsIntro';

describe('DialogCollectionsIntro', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the welcome copy, illustration, and actions when open', () => {
    render(<DialogCollectionsIntro open onOpenChange={vi.fn()} onContinue={vi.fn()} />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Welcome to Collections' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Save posts worth keeping. Collect the best content from your network. Curate ideas, filter signal from noise, and share what matters.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByAltText('Collections')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('renders nothing when closed', () => {
    render(<DialogCollectionsIntro open={false} onOpenChange={vi.fn()} onContinue={vi.fn()} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('advances the flow on Continue without requesting a close', () => {
    const onContinue = vi.fn();
    const onOpenChange = vi.fn();
    render(<DialogCollectionsIntro open onOpenChange={onOpenChange} onContinue={onContinue} />);

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('requests a close on Cancel', () => {
    const onContinue = vi.fn();
    const onOpenChange = vi.fn();
    render(<DialogCollectionsIntro open onOpenChange={onOpenChange} onContinue={onContinue} />);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onContinue).not.toHaveBeenCalled();
  });

  it('requests a close from the dialog X button', () => {
    const onOpenChange = vi.fn();
    render(<DialogCollectionsIntro open onOpenChange={onOpenChange} onContinue={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe('DialogCollectionsIntro - Snapshots', () => {
  it('matches snapshot when open', () => {
    render(<DialogCollectionsIntro open onOpenChange={vi.fn()} onContinue={vi.fn()} />);
    expect(document.body).toMatchSnapshot();
  });

  it('matches snapshot when closed', () => {
    const { container } = render(<DialogCollectionsIntro open={false} onOpenChange={vi.fn()} onContinue={vi.fn()} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
