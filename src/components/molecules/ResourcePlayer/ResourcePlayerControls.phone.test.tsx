import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { getPlayerTarget } from './resourcePlayer.utils';
import { PlayerSwitch } from './ResourcePlayerControls';

const SHOW = getPlayerTarget('https://podcasts.apple.com/us/podcast/darknet-diaries/id1296350485')!;
const SPOTIFY = getPlayerTarget('https://open.spotify.com/show/4XPl3uEEL9hvqMkoZrzbx5')!;

function renderSwitch(props: Partial<Parameters<typeof PlayerSwitch>[0]> = {}) {
  return render(
    <PlayerSwitch targets={[SHOW, SPOTIFY]} current={SHOW} onSelect={() => {}} onShowCard={() => {}} {...props} />,
  );
}

describe('PlayerSwitch on a phone', () => {
  it('shows the service’s favicon and the chevron only; the name stays its accessible name', () => {
    renderSwitch();

    const trigger = screen.getByRole('button', { name: 'Apple Podcasts: choose another service' });
    expect(within(trigger).getByText('Apple Podcasts')).toHaveClass('truncate', 'max-sm:hidden');
  });

  it('shows the card’s link icon and the chevron only while the card shows', () => {
    renderSwitch({ current: null });

    const trigger = screen.getByRole('button', { name: 'Card: choose another service' });
    expect(within(trigger).getByText('Card')).toHaveClass('max-sm:hidden');
  });

  it('keeps the name where no icon may load (platform embeds off)', () => {
    renderSwitch({ icons: false });

    const trigger = screen.getByRole('button', { name: 'Apple Podcasts: choose another service' });
    expect(within(trigger).getByText('Apple Podcasts')).not.toHaveClass('max-sm:hidden');
  });
});
