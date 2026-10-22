import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { renderWithQuery } from '@/test/renderWithQuery';
import { restoreMatchMedia, stubMatchMedia } from '@/test/matchMedia';
import type { MediaStub } from '@/test/matchMedia';
import { UserService } from '@/services';
import { BreezeProvider } from '../BreezeProvider';
import { BreezeBox } from './BreezeBox';

const auth = vi.hoisted(() => ({ user: { _id: 'user-1', breeze: 'breezy' } as { _id: string; breeze: string } }));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: auth.user }) }));
vi.mock('@/services', () => ({ UserService: { update: vi.fn(), getById: vi.fn() } }));

const REDUCED = '(prefers-reduced-motion: reduce)';
const mockedUsers = vi.mocked(UserService);

const renderBox = () =>
  renderWithQuery(
    <BreezeProvider>
      <BreezeBox />
    </BreezeProvider>,
  );

const checkedOption = () => screen.getAllByRole('radio').find(radio => (radio as HTMLInputElement).checked);

let media: MediaStub;

beforeEach(() => {
  media = stubMatchMedia({ [REDUCED]: false });
  auth.user = { _id: 'user-1', breeze: 'breezy' };
  mockedUsers.update.mockReset().mockResolvedValue({} as never);
  mockedUsers.getById.mockReset();
});

afterEach(restoreMatchMedia);

describe('BreezeBox', () => {
  it('offers the four levels in order as one group named Breeze', () => {
    renderBox();

    const group = screen.getByRole('radiogroup', { name: 'Breeze' });
    expect(group).toBeInTheDocument();
    expect(screen.getAllByRole('radio').map(radio => radio.getAttribute('value'))).toEqual([
      'still',
      'calm',
      'breezy',
      'gusty',
    ]);
    expect(screen.getAllByRole('radio').map(radio => radio.closest('label')?.textContent)).toEqual([
      'Still',
      'Calm',
      'Breezy',
      'Gusty',
    ]);
  });

  it('selects the stored level', () => {
    auth.user = { _id: 'user-1', breeze: 'calm' };
    renderBox();

    expect(checkedOption()).toHaveAttribute('value', 'calm');
  });

  it.each([
    ['still', '0 km/h'],
    ['calm', '12 km/h'],
    ['breezy', '38 km/h'],
    ['gusty', '74 km/h'],
  ])('says %s is %s', (level, hint) => {
    auth.user = { _id: 'user-1', breeze: level };
    renderBox();

    expect(screen.getByText(hint)).toBeInTheDocument();
  });

  it('saves a choice, shows it and moves the speed hint with it', async () => {
    const user = userEvent.setup();
    renderBox();

    await user.click(screen.getByRole('radio', { name: 'Gusty' }));

    expect(checkedOption()).toHaveAttribute('value', 'gusty');
    expect(screen.getByText('74 km/h')).toBeInTheDocument();
    await waitFor(() => expect(mockedUsers.update).toHaveBeenCalledWith('user-1', { breeze: 'gusty' }));
  });

  it('can be driven from the keyboard with the arrow keys', async () => {
    const user = userEvent.setup();
    renderBox();

    screen.getByRole('radio', { name: 'Breezy' }).focus();
    await user.keyboard('{ArrowRight}');

    expect(checkedOption()).toHaveAttribute('value', 'gusty');
    await waitFor(() => expect(mockedUsers.update).toHaveBeenCalledWith('user-1', { breeze: 'gusty' }));
  });

  it('has no accessibility violations', async () => {
    const { container } = renderBox();

    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('BreezeBox when the system asks for reduced motion', () => {
  beforeEach(() => {
    media = stubMatchMedia({ [REDUCED]: true });
    auth.user = { _id: 'user-1', breeze: 'gusty' };
  });

  it('says the wind is held and does not claim a speed', () => {
    renderBox();

    expect(screen.getByText('Reduced motion')).toBeInTheDocument();
    expect(screen.queryByText('74 km/h')).not.toBeInTheDocument();
  });

  it('names the group so a screen reader hears why the wind is still', () => {
    renderBox();

    expect(
      screen.getByRole('radiogroup', { name: 'Breeze, held still because your system asks for reduced motion' }),
    ).toBeInTheDocument();
  });

  it('keeps the stored choice selected instead of showing Still', () => {
    renderBox();

    expect(checkedOption()).toHaveAttribute('value', 'gusty');
  });

  it('still takes a new choice and keeps it, for every other device', async () => {
    const user = userEvent.setup();
    renderBox();

    await user.click(screen.getByRole('radio', { name: 'Calm' }));

    expect(checkedOption()).toHaveAttribute('value', 'calm');
    await waitFor(() => expect(mockedUsers.update).toHaveBeenCalledWith('user-1', { breeze: 'calm' }));
  });

  it('goes back to a speed once the preference is lifted', () => {
    renderBox();

    media.set(REDUCED, false);

    expect(screen.getByText('74 km/h')).toBeInTheDocument();
    expect(screen.queryByText('Reduced motion')).not.toBeInTheDocument();
  });
});
