import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { PROFILE_TAG_SCOPE } from '@/stores/home/home.types';
import { FilterProfileTags } from './FilterProfileTags';

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.setPointerCapture = vi.fn();
});

const defaultProps = {
  selectedTags: [] as string[],
  onTagAdd: vi.fn(),
  onTagRemove: vi.fn(),
  scope: PROFILE_TAG_SCOPE.NETWORK,
  onScopeChange: vi.fn(),
};

describe('FilterProfileTags', () => {
  it('renders the Tagged as controls and current reach scope', () => {
    const { container } = render(<FilterProfileTags {...defaultProps} />);

    expect(screen.getByRole('heading', { name: 'Tagged as' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('profile tag')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Choose who tagged these profiles' })).toHaveTextContent(
      'by my network',
    );
    expect(container.querySelector('.lucide-waypoints')).toHaveClass('size-5');
  });

  it('uses the UsersRound icon and lowercase label for Following', () => {
    const { container } = render(<FilterProfileTags {...defaultProps} scope={PROFILE_TAG_SCOPE.FOLLOWING} />);

    expect(screen.getByRole('combobox', { name: 'Choose who tagged these profiles' })).toHaveTextContent(
      'by following',
    );
    expect(container.querySelector('.lucide-users-round')).toHaveClass('size-5');
  });

  it('orders WoT scopes as Network, Following, then Me', async () => {
    const user = userEvent.setup();
    render(<FilterProfileTags {...defaultProps} />);

    await user.click(screen.getByRole('combobox', { name: 'Choose who tagged these profiles' }));

    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'by my network',
      'by following',
      'by me',
    ]);
  });

  it('adds a normalized profile tag from the input', async () => {
    const onTagAdd = vi.fn();
    render(<FilterProfileTags {...defaultProps} onTagAdd={onTagAdd} />);

    const input = screen.getByPlaceholderText('profile tag');
    fireEvent.change(input, { target: { value: 'Bitcoin' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(onTagAdd).toHaveBeenCalledWith('bitcoin'));
  });

  it('renders selected tags in a removable stack', async () => {
    const onTagRemove = vi.fn();
    const user = userEvent.setup();
    render(<FilterProfileTags {...defaultProps} selectedTags={['bitcoin', 'nostr']} onTagRemove={onTagRemove} />);

    expect(screen.getByText('bitcoin')).toBeInTheDocument();
    expect(screen.getByText('nostr')).toBeInTheDocument();

    await user.click(screen.getByLabelText('Remove bitcoin tag'));
    expect(onTagRemove).toHaveBeenCalledWith('bitcoin');
  });

  it('changes only the independent WoT scope through the compact dropdown', async () => {
    const onScopeChange = vi.fn();
    const user = userEvent.setup();
    render(<FilterProfileTags {...defaultProps} onScopeChange={onScopeChange} />);

    await user.click(screen.getByRole('combobox', { name: 'Choose who tagged these profiles' }));
    await user.click(screen.getByRole('option', { name: 'by following' }));

    expect(onScopeChange).toHaveBeenCalledWith(PROFILE_TAG_SCOPE.FOLLOWING);
  });

  it('offers Me as the Nexus depth-zero scope', async () => {
    const onScopeChange = vi.fn();
    const user = userEvent.setup();
    render(<FilterProfileTags {...defaultProps} onScopeChange={onScopeChange} />);

    await user.click(screen.getByRole('combobox', { name: 'Choose who tagged these profiles' }));
    await user.click(screen.getByRole('option', { name: 'by me' }));

    expect(onScopeChange).toHaveBeenCalledWith(PROFILE_TAG_SCOPE.ME);
  });

  it('uses a 100ms collapse transition when hidden', () => {
    render(<FilterProfileTags {...defaultProps} hidden />);

    expect(screen.getByTestId('filter-profile-tags-collapse')).toHaveClass(
      'grid-rows-[0fr]',
      'opacity-0',
      'pointer-events-none',
      'duration-100',
    );
    expect(screen.getByTestId('filter-profile-tags-collapse')).toHaveAttribute('aria-hidden', 'true');
  });

  it('keeps the previous chips mounted during the collapse animation', async () => {
    const { rerender } = render(<FilterProfileTags {...defaultProps} selectedTags={['bitcoin']} />);

    rerender(<FilterProfileTags {...defaultProps} selectedTags={[]} hidden />);
    expect(screen.getByText('bitcoin')).toBeInTheDocument();

    rerender(<FilterProfileTags {...defaultProps} selectedTags={[]} />);
    await waitFor(() => expect(screen.queryByText('bitcoin')).not.toBeInTheDocument());
  });

  it('enforces the five-tag limit', () => {
    render(<FilterProfileTags {...defaultProps} selectedTags={['one', 'two', 'three', 'four', 'five']} />);

    expect(screen.getByPlaceholderText('5 tags max')).toBeDisabled();
  });

  it('keeps the section visible while disabling unauthenticated input interaction', async () => {
    const onInputClick = vi.fn();
    const user = userEvent.setup();
    render(<FilterProfileTags {...defaultProps} inputDisabled onInputClick={onInputClick} />);

    expect(screen.getByTestId('filter-profile-tags-collapse')).toHaveClass('grid-rows-[1fr]', 'opacity-100');
    expect(screen.getByPlaceholderText('profile tag')).toBeDisabled();

    await user.click(screen.getByPlaceholderText('profile tag').parentElement!);
    expect(onInputClick).toHaveBeenCalled();
  });
});
