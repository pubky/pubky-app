import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PubchiCapabilities } from './PubchiCapabilities';

function ControlledCompactCapabilities() {
  const [open, setOpen] = useState(false);
  return (
    <PubchiCapabilities
      compact
      tier="read-only"
      onSelect={() => {}}
      onBuildFeed={() => {}}
      quickQuestionsOpen={open}
      onQuickQuestionsOpenChange={setOpen}
    />
  );
}

describe('PubchiCapabilities', () => {
  it('submits the canonical question for most followed users', () => {
    const onSelect = vi.fn();
    render(<PubchiCapabilities tier="read-only" onSelect={onSelect} onBuildFeed={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: 'Most followed users' }));

    expect(onSelect).toHaveBeenCalledWith('Who are the most followed users on Pubky?', 'ask');
  });

  it('submits the canonical question for most tagged users', () => {
    const onSelect = vi.fn();
    render(<PubchiCapabilities tier="read-only" onSelect={onSelect} onBuildFeed={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: 'Most tagged users' }));

    expect(onSelect).toHaveBeenCalledWith('Who has the most tags?', 'ask');
  });

  it('submits the canonical question for top taggers', () => {
    const onSelect = vi.fn();
    render(<PubchiCapabilities tier="read-only" onSelect={onSelect} onBuildFeed={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: 'Top taggers' }));

    expect(onSelect).toHaveBeenCalledWith('Who are the top taggers?', 'ask');
  });

  it('wraps every compact quick question without a horizontal scroll container', () => {
    render(<ControlledCompactCapabilities />);

    expect(screen.getByRole('button', { name: 'What did I miss?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Quick questions' }));
    expect(screen.getByRole('button', { name: 'Who tagged me?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Most followed users' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Most tagged users' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Top taggers' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Active threads' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Trending tags' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Who should I follow?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quiet follows' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Build feed' })).toBeInTheDocument();
    expect(screen.getByTestId('pubchi-capabilities-compact').querySelector('.overflow-x-auto')).toBeNull();
  });

  it('renders autonomous capabilities as disabled-looking non-controls', () => {
    render(<PubchiCapabilities tier="read-only" onSelect={() => {}} onBuildFeed={() => {}} />);

    expect(screen.getByTestId('pubchi-capabilities')).toHaveTextContent('not in this version');
    expect(screen.getByText('Posting, replying, and proactive digests — not in this version.')).not.toHaveAttribute(
      'href',
    );
  });
});
