import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { renderWithQuery } from '@/test/renderWithQuery';
import { restoreMatchMedia, stubMatchMedia } from '@/test/matchMedia';
import type { MediaStub } from '@/test/matchMedia';
import { AuthService, BoardService, ColorService, TemplateService } from '@/services';
import type { Board, User } from '@/models';
import { AppShell } from './AppShell';

// Below the large breakpoint the sidebar is an off-canvas panel. jsdom loads
// no stylesheet and has no `matchMedia`, so the breakpoint is stubbed and what
// is asserted is what the shell decides: the dialog role, the inert regions,
// where focus is, and when the panel closes.
vi.mock('@/services', () => ({
  AuthService: { getCurrentUser: vi.fn(), logout: vi.fn() },
  BoardService: { getAll: vi.fn(), getById: vi.fn(), create: vi.fn() },
  ColorService: { getByType: vi.fn() },
  TemplateService: { getAll: vi.fn() },
  UserService: { update: vi.fn(), getById: vi.fn() },
}));

// The shell reads the signed in person for the Breeze setting.
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: {
      _id: 'user-ada',
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      avatar: '',
      breeze: 'breezy',
    },
  }),
}));

vi.mock('@/hooks/useTextFile', () => ({
  default: () => ({ data: 'The document', loading: false, error: null, refetch: vi.fn() }),
}));

const LARGE = '(min-width: 1024px)';

const ADA: User = { _id: 'user-ada', firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', avatar: '' };

const makeBoard = (id: string, title: string): Board =>
  ({
    _id: id,
    title,
    description: '',
    color: { _id: 'color-sky', name: 'Sky', value: 'sky' },
    columns: [],
    template: 't1',
    createdBy: 'u',
    members: [],
  }) as unknown as Board;

const ROADMAP = makeBoard('board-1', 'Roadmap');
const LAUNCH = makeBoard('board-2', 'Launch plan');

let media: MediaStub;

const renderShell = (path = '/') =>
  renderWithQuery(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="*" element={<p>page content</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );

/** The sidebar wrapper, found through the button that controls it. */
const panel = () =>
  document.getElementById(screen.getByRole('button', { name: 'Open navigation' }).getAttribute('aria-controls')!)!;
const menuButton = () => screen.getByRole('button', { name: 'Open navigation' });
/** Everything beside the panel: the header and the page. */
const pageColumn = () => screen.getByRole('main').parentElement!;

const openPanel = async (user: ReturnType<typeof userEvent.setup>) => {
  await screen.findByRole('link', { name: 'Roadmap' });
  await user.click(menuButton());
  await screen.findByRole('dialog', { name: 'Navigation' });
};

beforeEach(() => {
  media = stubMatchMedia({ [LARGE]: false });
  vi.mocked(AuthService.getCurrentUser).mockReset().mockReturnValue(ADA);
  vi.mocked(BoardService.getAll).mockReset().mockResolvedValue([ROADMAP, LAUNCH]);
  vi.mocked(BoardService.getById).mockReset().mockResolvedValue(ROADMAP);
  vi.mocked(ColorService.getByType).mockReset().mockResolvedValue([]);
  vi.mocked(TemplateService.getAll).mockReset().mockResolvedValue([]);
});

afterEach(restoreMatchMedia);

describe('the sidebar as a panel', () => {
  it('is closed to start with: inert, not a dialog, and its button says so', async () => {
    renderShell();
    await screen.findByRole('link', { name: 'Roadmap' });

    expect(panel()).toHaveAttribute('inert');
    expect(panel()).not.toHaveAttribute('role');
    expect(menuButton()).toHaveAttribute('aria-expanded', 'false');
    expect(menuButton()).toHaveAttribute('aria-controls', 'app-sidebar');
    expect(pageColumn()).not.toHaveAttribute('inert');
  });

  // The class is what hides the button on a large screen, and a stylesheet is
  // not loaded here.
  it('has a menu button that only exists below the large breakpoint', async () => {
    renderShell();
    await screen.findByRole('link', { name: 'Roadmap' });

    expect(menuButton()).toHaveClass('lg:hidden');
    expect(screen.getByRole('button', { name: 'Close navigation' })).toHaveClass('lg:hidden');
  });

  it('opens as a dialog, makes the page inert, and moves focus inside', async () => {
    const user = userEvent.setup();
    renderShell();
    await openPanel(user);

    expect(panel()).not.toHaveAttribute('inert');
    expect(panel()).toHaveAttribute('role', 'dialog');
    expect(menuButton()).toHaveAttribute('aria-expanded', 'true');
    expect(pageColumn()).toHaveAttribute('inert');
    expect(panel()).toContainElement(document.activeElement as HTMLElement);
  });

  it('holds Tab inside the panel in both directions', async () => {
    const user = userEvent.setup();
    renderShell();
    await openPanel(user);

    const links = within(panel()).getAllByRole('link');
    const first = within(panel()).getAllByRole('link')[0];
    const last = links[links.length - 1];

    last.focus();
    await user.tab();
    expect(first).toHaveFocus();

    await user.tab({ shift: true });
    expect(last).toHaveFocus();
  });

  it('closes on Escape and gives focus back to the button that opened it', async () => {
    const user = userEvent.setup();
    renderShell();
    await openPanel(user);

    await user.keyboard('{Escape}');

    await waitFor(() => expect(panel()).toHaveAttribute('inert'));
    expect(panel()).not.toHaveAttribute('role');
    expect(menuButton()).toHaveFocus();
    expect(pageColumn()).not.toHaveAttribute('inert');
  });

  it('closes when the scrim is pressed', async () => {
    const user = userEvent.setup();
    const { container } = renderShell();
    await openPanel(user);

    await user.click(container.querySelector('.bg-scrim')!);

    await waitFor(() => expect(panel()).toHaveAttribute('inert'));
    expect(menuButton()).toHaveFocus();
  });

  it('closes from its own close button', async () => {
    const user = userEvent.setup();
    renderShell();
    await openPanel(user);

    await user.click(screen.getByRole('button', { name: 'Close navigation' }));

    await waitFor(() => expect(panel()).toHaveAttribute('inert'));
    expect(menuButton()).toHaveFocus();
  });

  it('has no scrim while it is closed', async () => {
    const { container } = renderShell();
    await screen.findByRole('link', { name: 'Roadmap' });

    expect(container.querySelector('.bg-scrim')).not.toBeInTheDocument();
  });

  it.each([
    ['a board', () => screen.getByRole('link', { name: 'Launch plan' })],
    ['Home', () => within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'Home' })],
    ['the logo', () => screen.getByRole('link', { name: 'breezyboard' })],
  ])('closes when %s is chosen, because the destination is what was asked for', async (_name, target) => {
    const user = userEvent.setup();
    renderShell('/board/board-1');
    await openPanel(user);

    await user.click(target());

    await waitFor(() => expect(panel()).toHaveAttribute('inert'));
    expect(pageColumn()).not.toHaveAttribute('inert');
  });

  it.each([
    ['a board', () => screen.getByRole('link', { name: 'Launch plan' })],
    ['the logo', () => screen.getByRole('link', { name: 'breezyboard' })],
    ['the board that is open', () => screen.getByRole('link', { name: 'Roadmap' })],
  ])('moves focus to the main region when %s is chosen, not back to the menu button', async (_name, target) => {
    const user = userEvent.setup();
    renderShell('/board/board-1');
    await openPanel(user);

    await user.click(target());

    await waitFor(() => expect(panel()).toHaveAttribute('inert'));
    expect(document.getElementById('main')).toHaveFocus();
    expect(menuButton()).not.toHaveFocus();
  });

  it('moves focus to the main region when the address changes some other way', async () => {
    const user = userEvent.setup();
    renderShell('/');
    await openPanel(user);

    await user.click(screen.getByRole('button', { name: 'Account menu for Ada Lovelace' }));
    await user.click(screen.getByRole('menuitem', { name: /Profile/ }));

    await waitFor(() => expect(panel()).toHaveAttribute('inert'));
    expect(document.getElementById('main')).toHaveFocus();
  });

  it('gives focus back to the menu button when the panel is dismissed after an earlier destination', async () => {
    const user = userEvent.setup();
    renderShell('/board/board-1');
    await openPanel(user);
    await user.click(screen.getByRole('link', { name: 'Launch plan' }));
    await waitFor(() => expect(panel()).toHaveAttribute('inert'));

    await openPanel(user);
    await user.keyboard('{Escape}');

    await waitFor(() => expect(panel()).toHaveAttribute('inert'));
    expect(menuButton()).toHaveFocus();
  });

  // The address does not change, so only the link itself can say the panel is
  // done.
  it.each([
    ['Home', '/', () => within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'Home' })],
    ['the logo', '/', () => screen.getByRole('link', { name: 'breezyboard' })],
    ['the board that is open', '/board/board-1', () => screen.getByRole('link', { name: 'Roadmap' })],
  ])('closes when %s is chosen while already there', async (_name, path, target) => {
    const user = userEvent.setup();
    renderShell(path);
    await openPanel(user);

    await user.click(target());

    await waitFor(() => expect(panel()).toHaveAttribute('inert'));
  });

  it('closes when the address changes some other way, such as the account menu going to the profile', async () => {
    const user = userEvent.setup();
    renderShell('/');
    await openPanel(user);

    await user.click(screen.getByRole('button', { name: 'Account menu for Ada Lovelace' }));
    await user.click(screen.getByRole('menuitem', { name: /Profile/ }));

    await waitFor(() => expect(panel()).toHaveAttribute('inert'));
  });

  it('stays closed when the window grows past the breakpoint and is not reopened by shrinking it again', async () => {
    const user = userEvent.setup();
    renderShell();
    await openPanel(user);

    media.set(LARGE, true);
    expect(panel()).not.toHaveAttribute('inert');
    expect(panel()).not.toHaveAttribute('role');
    expect(pageColumn()).not.toHaveAttribute('inert');

    media.set(LARGE, false);
    expect(panel()).toHaveAttribute('inert');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('is a fixed column that is never inert on a large screen', async () => {
    media.set(LARGE, true);
    renderShell();
    await screen.findByRole('link', { name: 'Roadmap' });

    expect(panel()).not.toHaveAttribute('inert');
    expect(panel()).not.toHaveAttribute('role');
    expect(pageColumn()).not.toHaveAttribute('inert');
  });
});

describe('a dialog opened from the panel', () => {
  it('answers Escape without closing the panel underneath it', async () => {
    const user = userEvent.setup();
    renderShell();
    await openPanel(user);

    await user.click(screen.getByRole('button', { name: 'Create board' }));
    await screen.findByRole('dialog', { name: 'Create new board' });
    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Create new board' })).not.toBeInTheDocument());
    expect(panel()).toHaveAttribute('role', 'dialog');
    expect(panel()).not.toHaveAttribute('inert');
  });

  it('is not made inert with the page, so it can be used', async () => {
    const user = userEvent.setup();
    renderShell();
    await openPanel(user);

    await user.click(screen.getByRole('button', { name: 'Privacy policy' }));

    const dialog = await screen.findByRole('dialog', { name: 'Privacy Policy - BreezyBoard' });
    expect(dialog.closest('[inert]')).toBeNull();
  });
});
