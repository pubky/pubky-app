import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ActionButtons } from './ActionButtons';

describe('ActionButtons', () => {
  it('renders create account button with default text', () => {
    render(<ActionButtons />);

    const createAccountButton = screen.getByRole('button', { name: /join/i });

    expect(createAccountButton).toBeInTheDocument();

    expect(document.querySelector('.lucide-user-round-plus')).toBeInTheDocument();
  });

  it('calls onCreateAccount when create account button is clicked', () => {
    const mockOnCreateAccount = vi.fn();
    render(<ActionButtons onCreateAccount={mockOnCreateAccount} />);

    const createAccountButton = screen.getByRole('button', { name: /join/i });
    fireEvent.click(createAccountButton);

    expect(mockOnCreateAccount).toHaveBeenCalledTimes(1);
  });

  it('handles create account and explore callbacks', () => {
    const mockOnCreateAccount = vi.fn();
    const mockOnExplore = vi.fn();

    render(<ActionButtons onCreateAccount={mockOnCreateAccount} onExplore={mockOnExplore} />);

    const createAccountButton = screen.getByRole('button', { name: /join/i });
    const exploreButton = screen.getByRole('button', { name: /explore/i });

    fireEvent.click(exploreButton);
    fireEvent.click(createAccountButton);

    expect(mockOnExplore).toHaveBeenCalledTimes(1);
    expect(mockOnCreateAccount).toHaveBeenCalledTimes(1);
  });

  it('renders and calls Learn when onLearn is provided', () => {
    const mockOnLearn = vi.fn();
    render(<ActionButtons onLearn={mockOnLearn} />);

    const learnButton = screen.getByRole('button', { name: /learn/i });
    fireEvent.click(learnButton);

    expect(learnButton).toBeInTheDocument();
    expect(document.querySelector('.lucide-book-open')).toBeInTheDocument();
    expect(mockOnLearn).toHaveBeenCalledTimes(1);
  });

  it('renders and calls Explore when onExplore is provided', () => {
    const mockOnExplore = vi.fn();
    render(<ActionButtons onExplore={mockOnExplore} />);

    const exploreButton = screen.getByRole('button', { name: /explore/i });
    fireEvent.click(exploreButton);

    expect(exploreButton).toBeInTheDocument();
    expect(document.querySelector('.lucide-eye')).toBeInTheDocument();
    expect(mockOnExplore).toHaveBeenCalledTimes(1);
  });
});

describe('ActionButtons - Snapshots', () => {
  it('matches snapshot with default props', () => {
    const { container } = render(<ActionButtons />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with custom className', () => {
    const { container } = render(<ActionButtons className="custom-action-buttons" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with create account and explore callbacks', () => {
    const mockOnCreateAccount = vi.fn();
    const mockOnExplore = vi.fn();

    const { container } = render(<ActionButtons onCreateAccount={mockOnCreateAccount} onExplore={mockOnExplore} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with all callbacks', () => {
    const mockOnLearn = vi.fn();
    const mockOnCreateAccount = vi.fn();
    const mockOnExplore = vi.fn();

    const { container } = render(
      <ActionButtons onLearn={mockOnLearn} onCreateAccount={mockOnCreateAccount} onExplore={mockOnExplore} />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with create account callback only', () => {
    const mockOnCreateAccount = vi.fn();

    const { container } = render(<ActionButtons onCreateAccount={mockOnCreateAccount} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
