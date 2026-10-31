import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SocialMigrationProgress } from './SocialMigrationProgress';

const rows = () =>
  screen
    .getAllByText(/^(Checking your account|Listing your data|Copying your data|Finishing up)( · .+)?$/)
    .map((node) => node.closest('div')!);
const iconOf = (row: HTMLElement) => row.querySelector('svg')!;

describe('SocialMigrationProgress', () => {
  it('runs the first step before the engine reports a phase', () => {
    render(<SocialMigrationProgress done={0} total={0} />);
    const [checking, listing] = rows();
    expect(iconOf(checking)).toHaveClass('animate-spin');
    expect(iconOf(listing)).not.toHaveClass('animate-spin');
    expect(screen.getByRole('progressbar')).toHaveAttribute('data-state', 'indeterminate');
    expect(screen.getByText('Preparing...')).toBeInTheDocument();
  });

  it('marks the earlier steps complete, the current one running and names the pass', () => {
    render(<SocialMigrationProgress phase="migrating" pass="blobs" done={3} total={12} />);
    const [checking, listing, copying, finishing] = rows();
    expect(iconOf(checking)).not.toHaveClass('animate-spin');
    expect(iconOf(listing)).not.toHaveClass('animate-spin');
    expect(iconOf(copying)).toHaveClass('animate-spin');
    expect(within(copying).getByText('· Media')).toBeInTheDocument();
    expect(iconOf(finishing)).not.toHaveClass('animate-spin');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '25');
    expect(screen.getByText('3 of 12')).toBeInTheDocument();
  });

  it.each([
    ['files', 'Media details'],
    ['posts', 'Posts'],
    ['tags', 'Tags'],
    ['follows', 'Follows'],
    ['profile', 'Profile'],
    ['feeds', 'Feeds'],
    ['bookmarks', 'Bookmarks'],
    ['mutes', 'Muted users'],
  ] as const)('names the %s pass "%s"', (pass, label) => {
    render(<SocialMigrationProgress phase="migrating" pass={pass} done={1} total={2} />);
    expect(screen.getByText(`· ${label}`)).toBeInTheDocument();
  });

  it('completes every step once the flag is written and shows where an earlier run stopped', () => {
    render(<SocialMigrationProgress phase="done" done={12} total={12} resumedFrom={{ done: 4, total: 12 }} />);
    for (const row of rows()) expect(iconOf(row)).not.toHaveClass('animate-spin');
    expect(screen.getByText('Continuing from an earlier run')).toBeInTheDocument();
  });

  it.each([
    [1, 13, '8'],
    [7, 13, '54'],
    [13, 13, '100'],
  ])('fills the bar to the copied share at %i of %i, like the count beside it', (done, total, percent) => {
    render(<SocialMigrationProgress phase="migrating" pass="files" done={done} total={total} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', percent);
    expect(screen.getByText(`${done} of ${total}`)).toBeInTheDocument();
  });

  it.each([
    ['listing', 'Preparing...'],
    ['flag', 'Finishing up...'],
    ['done', 'Finishing up...'],
  ] as const)('keeps the bar indeterminate in the %s phase, with no count', (phase, label) => {
    render(<SocialMigrationProgress phase={phase} done={12} total={12} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('data-state', 'indeterminate');
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.queryByText('12 of 12')).not.toBeInTheDocument();
  });
});
