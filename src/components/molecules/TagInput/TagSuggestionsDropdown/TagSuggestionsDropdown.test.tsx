import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TagSuggestionsDropdown } from './TagSuggestionsDropdown';

const defaultProps = {
  suggestions: [{ label: 'bitcoin' }, { label: 'btc' }, { label: 'lightning' }],
  selectedIndex: null,
  onSelect: vi.fn(),
  onSelectIndexChange: vi.fn(),
  onMouseDown: vi.fn(),
};

describe('TagSuggestionsDropdown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all suggestions when suggestions are provided', () => {
    render(<TagSuggestionsDropdown {...defaultProps} />);

    expect(screen.getByText('bitcoin')).toBeInTheDocument();
    expect(screen.getByText('btc')).toBeInTheDocument();
    expect(screen.getByText('lightning')).toBeInTheDocument();
  });

  it('calls onSelect when a suggestion is clicked', () => {
    const onSelect = vi.fn();
    render(<TagSuggestionsDropdown {...defaultProps} onSelect={onSelect} />);

    fireEvent.click(screen.getByText('bitcoin'));

    expect(onSelect).toHaveBeenCalledWith('bitcoin');
  });

  it('calls onSelectIndexChange when hovering over a suggestion', () => {
    const onSelectIndexChange = vi.fn();
    render(<TagSuggestionsDropdown {...defaultProps} onSelectIndexChange={onSelectIndexChange} />);

    fireEvent.mouseEnter(screen.getByText('btc'));

    expect(onSelectIndexChange).toHaveBeenCalledWith(1);
  });

  it('calls onMouseDown when clicking on the container', () => {
    const onMouseDown = vi.fn();
    render(<TagSuggestionsDropdown {...defaultProps} onMouseDown={onMouseDown} />);

    fireEvent.mouseDown(screen.getByText('bitcoin'));

    expect(onMouseDown).toHaveBeenCalled();
  });

  it('renders with selectedIndex without error', () => {
    render(<TagSuggestionsDropdown {...defaultProps} selectedIndex={1} />);

    expect(screen.getByText('bitcoin')).toBeInTheDocument();
    expect(screen.getByText('btc')).toBeInTheDocument();
    expect(screen.getByText('lightning')).toBeInTheDocument();
  });
});

describe('TagSuggestionsDropdown - Snapshots', () => {
  it('matches snapshot with suggestions', () => {
    render(<TagSuggestionsDropdown {...defaultProps} />);

    const dropdown = screen.getByTestId('tag-suggestions-dropdown');
    expect(dropdown).toMatchSnapshot();
  });

  it('matches snapshot with selected index', () => {
    render(<TagSuggestionsDropdown {...defaultProps} selectedIndex={0} />);

    const dropdown = screen.getByTestId('tag-suggestions-dropdown');
    expect(dropdown).toMatchSnapshot();
  });
});
