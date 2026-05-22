import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TaggedEmpty } from './TaggedEmpty';

const mockHandleTagAdd = vi.fn().mockResolvedValue({ success: true });

// Mock IllustratedEmptyState and TagInput
vi.mock('@/molecules/IllustratedEmptyState/IllustratedEmptyState', () => {
  return {
    IllustratedEmptyState: ({
      imageSrc,
      imageAlt,
      icon: Icon,
      title,
      subtitle,
      children,
    }: {
      imageSrc: string;
      imageAlt: string;
      icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
      title: string;
      subtitle: React.ReactNode;
      children?: React.ReactNode;
    }) => (
      <div data-testid="empty-state">
        <div data-testid="image" data-src={imageSrc} data-alt={imageAlt} />
        <Icon data-testid="tag-icon" />
        <h3>{title}</h3>
        <div>{subtitle}</div>
        {children}
      </div>
    ),
  };
});

vi.mock('@/molecules/TagInput/TagInput', () => {
  return {
    TagInput: ({ onTagAdd }: { onTagAdd: (tag: string) => void }) => (
      <div data-testid="tag-input" onClick={() => onTagAdd('test-tag')}>
        TagInput
      </div>
    ),
  };
});

describe('TaggedEmpty', () => {
  it('renders without errors', () => {
    const { container } = render(<TaggedEmpty onTagAdd={mockHandleTagAdd} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('displays title and subtitle', () => {
    render(<TaggedEmpty onTagAdd={mockHandleTagAdd} />);
    expect(screen.getByText('Discover who tagged you')).toBeInTheDocument();
    expect(screen.getByText(/No one has tagged you yet/)).toBeInTheDocument();
  });

  it('renders TagInput when onTagAdd is provided', () => {
    render(<TaggedEmpty onTagAdd={mockHandleTagAdd} />);
    expect(screen.getByTestId('tag-input')).toBeInTheDocument();
  });

  it('does not render TagInput when onTagAdd is not provided', () => {
    render(<TaggedEmpty />);
    expect(screen.queryByTestId('tag-input')).not.toBeInTheDocument();
  });

  it('renders Tag icon', () => {
    render(<TaggedEmpty onTagAdd={mockHandleTagAdd} />);
    expect(screen.getByTestId('tag-icon')).toBeInTheDocument();
  });
});

describe('TaggedEmpty - Snapshots', () => {
  it('matches snapshot', () => {
    const { container } = render(<TaggedEmpty onTagAdd={mockHandleTagAdd} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
