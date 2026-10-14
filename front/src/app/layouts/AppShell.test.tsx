import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { renderWithQuery } from '@/test/renderWithQuery';
import { restoreMatchMedia, stubMatchMedia } from '@/test/matchMedia';
import { AuthService, BoardService, ColorService, TemplateService, UserService } from '@/services';
import type { Board, User } from '@/models';
import { AppShell } from './AppShell';
import { ShellAction } from './shell/ShellAction';
import { useShell } from './shell/shellContext';

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

// The legal dialogs read a text file from the public folder. A stub keeps the
// real network out and gives the dialog something to show.
vi.mock('@/hooks/useTextFile', () => ({
  default: () => ({ data: 'The document', loading: false, error: null, refetch: vi.fn() }),
}));

const navigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

const mockedAuth = vi.mocked(AuthService);
const mockedBoards = vi.mocked(BoardService);
const mockedColors = vi.mocked(ColorService);
const mockedTemplates = vi.mocked(TemplateService);

const ADA: User = { _id: 'user-ada', firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', avatar: '' };

const makeBoard = (id: string, title: string, hue = 'sky'): Board =>
  ({
    _id: id,
    title,
    description: '',
    color: { _id: `color-${hue}`, name: hue, value: hue },
    columns: [],
    template: 'template-1',
    createdBy: 'user-ada',
    members: [],
    taskCount: 0,
    memberCount: 1,
    progress: 0,
  }) as Board;

const ROADMAP = makeBoard('board-1', 'Roadmap', 'coral');
const LAUNCH = makeBoard('board-2', 'Launch plan', 'teal');

/** Prints the address, so a test can read where a link took the router. */
const LocationProbe = () => {
  const { pathname, hash } = useLocation();
  return <p data-testid="location">{`${pathname}${hash}`}</p>;
};

const renderShell = (path = '/', page: React.ReactNode = <p>page content</p>) =>
  renderWithQuery(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="*" element={page} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  navigate.mockReset();
  mockedAuth.getCurrentUser.mockReset().mockReturnValue(ADA);
  mockedBoards.getAll.mockReset().mockResolvedValue([ROADMAP, LAUNCH]);
  mockedBoards.getById.mockReset().mockResolvedValue(ROADMAP);
  mockedBoards.create.mockReset();
  mockedColors.getByType.mockReset().mockResolvedValue([]);
  mockedTemplates.getAll.mockReset().mockResolvedValue([]);
});

describe('the frame', () => {
  it('puts the page in a main landmark under a banner, with no footer', async () => {
    renderShell();

    expect(within(screen.getByRole('main')).getByText('page content')).toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Roadmap' })).toBeInTheDocument();
  });

  // jsdom loads no stylesheet, so the class is the only thing to hold. The
  // board's columns scroll inside themselves, so a content area that also
  // scrolled would give the page a second vertical scrollbar beside theirs.
  it.each([
    ['/board/board-1', 'overflow-hidden'],
    ['/', 'overflow-y-auto'],
    ['/profile', 'overflow-y-auto'],
  ])('clips the content area on a board and scrolls it elsewhere: %s', async (path, overflow) => {
    renderShell(path);

    expect(screen.getByRole('main')).toHaveClass(overflow);
    await screen.findByRole('link', { name: 'Roadmap' });
  });

  it('has exactly one banner and one main landmark', async () => {
    renderShell();

    expect(screen.getAllByRole('banner')).toHaveLength(1);
    expect(screen.getAllByRole('main')).toHaveLength(1);
    await screen.findByRole('link', { name: 'Roadmap' });
  });
});

describe('the sidebar navigation', () => {
  it('links the logo and Home to the home page and marks Home as the current page there', async () => {
    renderShell('/');

    expect(screen.getByRole('link', { name: 'breezyboard' })).toHaveAttribute('href', '/');
    const home = screen.getByRole('link', { name: 'Home' });
    expect(home).toHaveAttribute('href', '/');
    expect(home).toHaveAttribute('aria-current', 'page');
    await screen.findByRole('link', { name: 'Roadmap' });
  });

  it('does not mark Home as current on a board', async () => {
    renderShell('/board/board-1');

    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current');
    await screen.findByRole('link', { name: 'Roadmap' });
  });

  it('offers no Notes link until the page exists', async () => {
    renderShell();

    expect(screen.queryByRole('link', { name: /notes/i })).not.toBeInTheDocument();
    await screen.findByRole('link', { name: 'Roadmap' });
  });

  it('lists every board as a real link and marks only the open one as current', async () => {
    renderShell('/board/board-2');

    const roadmap = await screen.findByRole('link', { name: 'Roadmap' });
    const launch = screen.getByRole('link', { name: 'Launch plan' });

    expect(roadmap).toHaveAttribute('href', '/board/board-1');
    expect(launch).toHaveAttribute('href', '/board/board-2');
    expect(launch).toHaveAttribute('aria-current', 'page');
    expect(roadmap).not.toHaveAttribute('aria-current');
  });

  it('draws the dot of each board in the hue its owner chose', async () => {
    renderShell();

    const dotOf = async (name: string) => (await screen.findByRole('link', { name })).querySelector('[aria-hidden="true"]');

    expect(await dotOf('Roadmap')).toHaveClass('bg-coral-mid');
    expect(await dotOf('Launch plan')).toHaveClass('bg-teal-mid');
  });

  it('draws the dot of a board whose colour is not a hue in the default one', async () => {
    mockedBoards.getAll.mockResolvedValue([{ ...ROADMAP, color: 'color-gone' }]);
    renderShell();

    const link = await screen.findByRole('link', { name: 'Roadmap' });

    expect(link.querySelector('[aria-hidden="true"]')).toHaveClass('bg-sky-mid');
  });

  it('says so when there are no boards', async () => {
    mockedBoards.getAll.mockResolvedValue([]);
    renderShell();

    expect(await screen.findByText('No boards yet')).toBeInTheDocument();
  });

  it('reports a failed load and asks again when told to', async () => {
    const user = userEvent.setup();
    mockedBoards.getAll.mockRejectedValueOnce(new Error('offline'));
    renderShell();

    expect(await screen.findByRole('alert')).toHaveTextContent('Boards could not be loaded.');
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('link', { name: 'Roadmap' })).toBeInTheDocument();
    expect(mockedBoards.getAll).toHaveBeenCalledTimes(2);
  });
});

describe('creating a board from the sidebar', () => {
  it('opens the create board dialog', async () => {
    const user = userEvent.setup();
    renderShell();
    await screen.findByRole('link', { name: 'Roadmap' });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create board' }));

    expect(await screen.findByRole('dialog', { name: 'Create New Board' })).toBeInTheDocument();
  });

  it('opens the same dialog from a view that asks the shell for it', async () => {
    const user = userEvent.setup();
    // A view reaches the shell the way the home page does: its main action is
    // drawn in the header and asks the shell to open the dialog.
    const View = () => {
      const shell = useShell();
      return (
        <ShellAction>
          <button type="button" onClick={() => shell?.openCreateBoard()}>
            New board
          </button>
        </ShellAction>
      );
    };
    renderShell('/', <View />);
    await screen.findByRole('link', { name: 'Roadmap' });

    const action = await within(screen.getByRole('banner')).findByRole('button', { name: 'New board' });
    expect(within(screen.getByRole('main')).queryByRole('button', { name: 'New board' })).not.toBeInTheDocument();
    await user.click(action);

    expect(await screen.findByRole('dialog', { name: 'Create New Board' })).toBeInTheDocument();
  });
});

describe('the foot of the sidebar', () => {
  it('opens the account menu with the profile and the way out', async () => {
    const user = userEvent.setup();
    renderShell();
    await screen.findByRole('link', { name: 'Roadmap' });

    await user.click(screen.getByRole('button', { name: 'Account menu for Ada Lovelace' }));

    expect(screen.getByRole('menuitem', { name: /Profile/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Log out/ })).toBeInTheDocument();
  });

  it('keeps the privacy policy and the terms one press away', async () => {
    const user = userEvent.setup();
    renderShell();
    await screen.findByRole('link', { name: 'Roadmap' });

    await user.click(screen.getByRole('button', { name: 'Privacy policy' }));
    expect(await screen.findByRole('dialog', { name: 'Privacy Policy - BreezyBoard' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Terms' }));
    expect(await screen.findByRole('dialog', { name: 'Terms of Service - BreezyBoard' })).toBeInTheDocument();
  });

  it('keeps the three ways to reach the author, the external ones opening elsewhere', async () => {
    renderShell();
    await screen.findByRole('link', { name: 'Roadmap' });

    const linkedin = screen.getByRole('link', { name: 'LinkedIn profile' });
    const github = screen.getByRole('link', { name: 'GitHub profile' });
    const email = screen.getByRole('link', { name: 'Send email' });

    expect(linkedin).toHaveAttribute('href', 'https://www.linkedin.com/in/kevin-feuerschvenger/');
    expect(github).toHaveAttribute('href', 'https://github.com/kfeuerschvenger');
    expect(email).toHaveAttribute('href', 'mailto:kfeuerschvenger@gmail.com');
    for (const external of [linkedin, github]) {
      expect(external).toHaveAttribute('target', '_blank');
      expect(external).toHaveAttribute('rel', expect.stringContaining('noopener'));
    }
    expect(email).not.toHaveAttribute('target');
    expect(screen.getByText(`${new Date().getFullYear()} Kevin Feuerschvenger`)).toBeInTheDocument();
  });
});

describe('the header', () => {
  const breadcrumb = () => screen.getByRole('navigation', { name: 'Breadcrumb' });

  it('names the section on the home page', async () => {
    renderShell('/');

    expect(within(breadcrumb()).getByText('Home')).toHaveAttribute('aria-current', 'page');
    await screen.findByRole('link', { name: 'Roadmap' });
  });

  it('names the section and the board on a board, and marks the board as the current page', async () => {
    renderShell('/board/board-1');

    const board = await within(breadcrumb()).findByText('Roadmap');

    expect(board).toHaveAttribute('aria-current', 'page');
    expect(within(breadcrumb()).getByText('Home')).not.toHaveAttribute('aria-current');
  });

  it('reads Home, Boards, then the board on a board: two links and the board as text', async () => {
    renderShell('/board/board-1');
    const board = await within(breadcrumb()).findByText('Roadmap');

    const home = within(breadcrumb()).getByRole('link', { name: 'Home' });
    const boards = within(breadcrumb()).getByRole('link', { name: 'Boards' });

    expect(home).toHaveAttribute('href', '/');
    expect(boards).toHaveAttribute('href', '/#boards');
    expect(home).not.toHaveAttribute('aria-current');
    expect(boards).not.toHaveAttribute('aria-current');
    expect(within(breadcrumb()).getAllByRole('link')).toEqual([home, boards]);
    expect(board.closest('a')).toBeNull();
    expect(board).toHaveAttribute('aria-current', 'page');
    expect(within(breadcrumb()).getAllByRole('listitem').map(item => item.textContent)).toEqual([
      'Home',
      'Boards',
      'Roadmap',
    ]);
  });

  it('keeps the separators out of the accessibility tree', async () => {
    renderShell('/board/board-1');
    await within(breadcrumb()).findByText('Roadmap');

    const separators = breadcrumb().querySelectorAll('li[aria-hidden="true"]');

    expect(separators).toHaveLength(2);
    expect(within(breadcrumb()).getAllByRole('listitem')).toHaveLength(3);
  });

  // 44 pixels tall on touch and 32 from the large breakpoint, never the bare
  // line of text: a class assertion because jsdom loads no stylesheet.
  it('gives both links a focus ring and a target that is not the line of text', async () => {
    renderShell('/board/board-1');
    await within(breadcrumb()).findByText('Roadmap');

    for (const name of ['Home', 'Boards']) {
      expect(within(breadcrumb()).getByRole('link', { name })).toHaveClass('focus-ring', 'min-h-11', 'lg:min-h-8');
    }
  });

  it('lets the board name shrink and truncate before either link does', async () => {
    renderShell('/board/board-1');
    const board = await within(breadcrumb()).findByText('Roadmap');

    expect(board).toHaveClass('min-w-0', 'truncate');
    expect(board).toHaveAttribute('title', 'Roadmap');
    for (const name of ['Home', 'Boards']) {
      expect(within(breadcrumb()).getByRole('link', { name }).closest('li')).toHaveClass('shrink-0');
    }
  });

  // jsdom loads no stylesheet, so the classes are what can be asserted. The
  // real widths are measured by `responsive.mjs` at 320 and 390 pixels.
  it('gives the name the room below the small breakpoint: Home is an icon that keeps its name, Boards is not drawn', async () => {
    renderShell('/board/board-1');
    await within(breadcrumb()).findByText('Roadmap');

    const home = within(breadcrumb()).getByRole('link', { name: 'Home' });
    const boards = within(breadcrumb()).getByRole('link', { name: 'Boards' });

    expect(within(home).getByText('Home')).toHaveClass('sr-only', 'sm:not-sr-only');
    expect(boards.closest('li')).toHaveClass('hidden', 'sm:flex');
  });

  it('goes to the home page when Home is pressed', async () => {
    const user = userEvent.setup();
    renderShell('/board/board-1');
    await within(breadcrumb()).findByText('Roadmap');

    await user.click(within(breadcrumb()).getByRole('link', { name: 'Home' }));

    await waitFor(() => expect(within(breadcrumb()).queryByRole('link')).not.toBeInTheDocument());
    expect(within(breadcrumb()).getByText('Home')).toHaveAttribute('aria-current', 'page');
  });

  it('goes to the home page when Boards is pressed, with the fragment of the grid in the address', async () => {
    const user = userEvent.setup();
    renderShell('/board/board-1', <LocationProbe />);
    await within(breadcrumb()).findByText('Roadmap');

    await user.click(within(breadcrumb()).getByRole('link', { name: 'Boards' }));

    await waitFor(() => expect(within(breadcrumb()).queryByRole('link')).not.toBeInTheDocument());
    expect(within(breadcrumb()).getByText('Home')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('location')).toHaveTextContent('/#boards');
  });

  it('keeps the section as text on the pages that are not a board', async () => {
    renderShell('/profile');
    await screen.findByRole('link', { name: 'Roadmap' });

    expect(within(breadcrumb()).queryByRole('link')).not.toBeInTheDocument();
  });

  it('names the profile', async () => {
    renderShell('/profile');

    expect(within(breadcrumb()).getByText('Profile')).toHaveAttribute('aria-current', 'page');
    await screen.findByRole('link', { name: 'Roadmap' });
  });

  it('names an address that leads nowhere', async () => {
    renderShell('/no/such/page');

    expect(within(breadcrumb()).getByText('Not found')).toHaveAttribute('aria-current', 'page');
    await screen.findByRole('link', { name: 'Roadmap' });
  });

  it('shows the section alone when the board cannot be read', async () => {
    mockedBoards.getById.mockRejectedValue(new Error('gone'));
    renderShell('/board/board-9');
    await screen.findByRole('link', { name: 'Roadmap' });

    expect(within(breadcrumb()).getByText('Home')).toHaveAttribute('aria-current', 'page');
    expect(within(breadcrumb()).queryByRole('link')).not.toBeInTheDocument();
  });
});

describe('the wind and the Breeze control', () => {
  const REDUCED = '(prefers-reduced-motion: reduce)';
  const LARGE = '(min-width: 1024px)';

  /** The ambient layer: the one decorative box in the frame that takes no pointer events. */
  const windLayer = (container: HTMLElement) => container.querySelector('div[aria-hidden="true"].pointer-events-none');
  const streaks = (container: HTMLElement) => windLayer(container)?.querySelectorAll('svg path').length ?? 0;
  const particles = (container: HTMLElement) => windLayer(container)?.querySelectorAll(':scope > span').length ?? 0;
  const logoGlyph = () => screen.getByRole('link', { name: 'breezyboard' }).querySelector('svg');

  beforeEach(() => {
    vi.mocked(UserService.update)
      .mockReset()
      .mockResolvedValue({} as never);
  });

  afterEach(restoreMatchMedia);

  it('draws the stored level over the ground, in the dark tone, behind the sidebar and the page', async () => {
    const { container } = renderShell();
    await screen.findByRole('link', { name: 'Roadmap' });

    expect(streaks(container)).toBe(6);
    expect(particles(container)).toBe(9);
    // The dark tone is coloured and the light one white, and the ground is light.
    expect(windLayer(container)?.querySelector('svg path')?.getAttribute('stroke')).toMatch(/^oklch\(/);
    expect(windLayer(container)?.nextElementSibling?.id).toBe('app-sidebar');
  });

  it('changes the wind when a level is chosen, and removes it at still', async () => {
    const user = userEvent.setup();
    const { container } = renderShell();
    await screen.findByRole('link', { name: 'Roadmap' });

    await user.click(screen.getByRole('radio', { name: 'Gusty' }));
    expect([streaks(container), particles(container)]).toEqual([11, 20]);

    await user.click(screen.getByRole('radio', { name: 'Calm' }));
    expect([streaks(container), particles(container)]).toEqual([3, 3]);

    await user.click(screen.getByRole('radio', { name: 'Still' }));
    expect(windLayer(container)).toBeNull();
    await waitFor(() => expect(UserService.update).toHaveBeenLastCalledWith('user-ada', { breeze: 'still' }));
  });

  it('sways the logo while there is wind and holds it still when there is none', async () => {
    const user = userEvent.setup();
    renderShell();
    await screen.findByRole('link', { name: 'Roadmap' });
    expect(logoGlyph()).toHaveClass('animate-bb-sway');

    await user.click(screen.getByRole('radio', { name: 'Still' }));

    expect(logoGlyph()).not.toHaveClass('animate-bb-sway');
  });

  it('draws no wind and no sway when the system asks for reduced motion, and keeps the choice shown', async () => {
    stubMatchMedia({ [LARGE]: true, [REDUCED]: true });
    const { container } = renderShell();
    await screen.findByRole('link', { name: 'Roadmap' });

    expect(windLayer(container)).toBeNull();
    expect(logoGlyph()).not.toHaveClass('animate-bb-sway');
    expect(screen.getByText('Reduced motion')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Breezy' })).toBeChecked();
  });

  it('puts the wind back when the preference is lifted', async () => {
    const media = stubMatchMedia({ [LARGE]: true, [REDUCED]: true });
    const { container } = renderShell();
    await screen.findByRole('link', { name: 'Roadmap' });
    expect(windLayer(container)).toBeNull();

    media.set(REDUCED, false);

    expect(streaks(container)).toBe(6);
  });
});
