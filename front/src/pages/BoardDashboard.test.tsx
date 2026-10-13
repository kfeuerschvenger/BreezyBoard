import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { renderWithQuery } from '@/test/renderWithQuery';
import BoardDashboard from './BoardDashboard';
import { ShellContext } from '@/app/layouts/shell/shellContext';
import { AuthService, BoardService, ColorService, DashboardService, TemplateService } from '@/services';
import type { Board } from '@/models';
import { HUES, MID_BACKGROUND, hueFromSeed } from '@/shared/ui';

// The home page: the greeting, the totals, one tile per board and the new
// board tile, and the per board menu and deletion that every tile carries.
//
// The page mounts CreateBoardModal, AddMemberModal and UserAvatar whatever
// it is doing, and each of those reaches a service of its own on mount, so
// all six are stubbed to keep the real axios client out of the suite.
vi.mock('@/services', () => ({
  AuthService: { getCurrentUser: vi.fn(), logout: vi.fn() },
  BoardService: { getAll: vi.fn(), create: vi.fn(), delete: vi.fn(), restore: vi.fn(), addMembers: vi.fn() },
  DashboardService: { getStats: vi.fn() },
  ColorService: { getByType: vi.fn(), getById: vi.fn() },
  TemplateService: { getAll: vi.fn() },
  UserService: { search: vi.fn(), getById: vi.fn() },
}));

const mockedAuthService = vi.mocked(AuthService);
const mockedBoardService = vi.mocked(BoardService);
const mockedColorService = vi.mocked(ColorService);
const mockedDashboardService = vi.mocked(DashboardService);
const mockedTemplateService = vi.mocked(TemplateService);

const STATS = { totalBoards: 7, totalMembers: 12, totalTasks: 34, avgProgress: 58 };

const SKY = { _id: 'color-sky', name: 'Sky', value: 'sky' };

const OWNER = { _id: 'user-1', firstName: 'Ada', lastName: 'Lovelace', avatar: '' };

const makeBoard = (overrides: Partial<Board>): Board => ({
  _id: 'board-default',
  title: 'Untitled',
  description: '',
  color: SKY,
  columns: [],
  template: { _id: 'template-1', name: 'Default', description: '', iconName: 'layout', columns: [] },
  createdBy: OWNER,
  members: [],
  taskCount: 0,
  memberCount: 0,
  progress: 0,
  // The list says who may act on each board, and the options menu renders for
  // owners only, so a board is an owner's unless a test says otherwise.
  viewerRole: 'owner',
  ...overrides,
});

const BOARDS: Board[] = [
  makeBoard({
    _id: 'board-launch',
    title: 'Launch Plan',
    description: 'Everything that has to happen before release',
    color: { _id: 'color-lavender', name: 'Lavender', value: 'lavender' },
    taskCount: 9,
    memberCount: 3,
    progress: 40,
    updatedAt: '2026-03-05T12:00:00.000Z',
  }),
  makeBoard({
    _id: 'board-hiring',
    title: 'Hiring',
    description: 'Open roles and candidates',
    color: { _id: 'color-green', name: 'Green', value: 'green' },
    taskCount: 2,
    memberCount: 5,
    progress: 0,
    updatedAt: '2026-03-01T12:00:00.000Z',
  }),
];

const openCreateBoard = vi.fn();

const renderDashboard = () =>
  renderWithQuery(
    <MemoryRouter>
      <ShellContext.Provider value={{ headerSlot: null, openCreateBoard }}>
        <BoardDashboard />
      </ShellContext.Provider>
    </MemoryRouter>
  );

// The introduction at the top of the page, found through its one h1.
const hero = () => screen.getByRole('heading', { level: 1 }).closest('header') as HTMLElement;

// A tile is the element that carries its hue.
const card = (title: string) => screen.getByRole('heading', { name: title }).closest('[data-hue]') as HTMLElement;

beforeEach(() => {
  openCreateBoard.mockReset();
  mockedAuthService.getCurrentUser.mockReset().mockReturnValue(null);
  mockedBoardService.getAll.mockReset().mockResolvedValue(BOARDS);
  mockedBoardService.delete.mockReset().mockResolvedValue(undefined);
  mockedBoardService.restore.mockReset();
  mockedDashboardService.getStats.mockReset().mockResolvedValue(STATS);
  mockedColorService.getByType.mockReset().mockResolvedValue([]);
  mockedColorService.getById.mockReset().mockResolvedValue({ _id: 'color-green', name: 'Green', value: 'green' });
  mockedTemplateService.getAll.mockReset().mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('BoardDashboard listing', () => {
  it('renders one card per board, with the title linking to that board', async () => {
    renderDashboard();

    const launch = await screen.findByRole('link', { name: 'Launch Plan' });
    expect(launch).toHaveAttribute('href', '/board/board-launch');
    expect(screen.getByRole('link', { name: 'Hiring' })).toHaveAttribute('href', '/board/board-hiring');
  });

  it('shows each board its description, its two counts and when it was last updated', async () => {
    renderDashboard();
    await screen.findByRole('link', { name: 'Launch Plan' });

    const launch = card('Launch Plan');
    expect(within(launch).getByText('Everything that has to happen before release')).toBeInTheDocument();
    expect(within(launch).getByText('9 tasks')).toBeInTheDocument();
    expect(within(launch).getByText('3')).toBeInTheDocument();
    // Asserted as a shape rather than as a literal date, because the page
    // formats in the runner's own time zone and the exact day would differ
    // between a developer's machine and CI.
    expect(within(launch).getByText(/^Updated \w{3} \d{1,2}$/)).toBeInTheDocument();
  });

  it('reports each board progress on a progressbar rather than on colour alone', async () => {
    renderDashboard();
    await screen.findByRole('link', { name: 'Launch Plan' });

    const bar = within(card('Launch Plan')).getByRole('progressbar', { name: 'Progress of Launch Plan' });
    expect(bar).toHaveAttribute('aria-valuenow', '40');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
    // The figure is written beside the bar as well, for anybody who wants the number.
    expect(within(card('Launch Plan')).getByText('40%')).toBeInTheDocument();
  });

  it('falls back to a placeholder title and description when the board has neither', async () => {
    mockedBoardService.getAll.mockResolvedValue([makeBoard({ _id: 'board-bare', title: '', description: '' })]);

    renderDashboard();

    expect(await screen.findByRole('link', { name: 'Untitled Board' })).toBeInTheDocument();
    expect(screen.getByText('No description')).toBeInTheDocument();
  });
});

describe('BoardDashboard board hues', () => {
  it('draws every tile in the hue of its board, whichever of the six it is', async () => {
    mockedBoardService.getAll.mockResolvedValue(
      HUES.map(hue =>
        makeBoard({ _id: `board-${hue}`, title: `A ${hue} board`, color: { _id: `c-${hue}`, name: hue, value: hue } })
      )
    );

    renderDashboard();
    await screen.findByRole('link', { name: 'A sky board' });

    for (const hue of HUES) {
      expect(card(`A ${hue} board`)).toHaveAttribute('data-hue', hue);
    }
  });

  it('fills the progress bar in the hue of its own tile', async () => {
    renderDashboard();
    await screen.findByRole('link', { name: 'Launch Plan' });

    // jsdom loads no stylesheet, so the class is what can be asserted. It is the
    // hue's edge step, and the two tiles are two different hues.
    expect(within(card('Launch Plan')).getByTestId('progress-fill')).toHaveClass('bg-lavender-edge');
    expect(within(card('Hiring')).getByTestId('progress-fill')).toHaveClass('bg-green-edge');
  });

  it('asks for no palette at all, because the hue arrives with the board', async () => {
    renderDashboard();
    await screen.findByRole('link', { name: 'Hiring' });

    expect(mockedColorService.getByType).not.toHaveBeenCalled();
    expect(mockedColorService.getById).not.toHaveBeenCalled();
  });

  it('paints a board whose colour is not a hue with the default one', async () => {
    mockedBoardService.getAll.mockResolvedValue([
      makeBoard({ _id: 'board-bare-id', title: 'Bare id', color: 'color-gone' }),
      makeBoard({ _id: 'board-hex', title: 'Hex', color: { _id: 'c', name: 'Blue', value: '#0052CC' } }),
    ]);

    renderDashboard();
    await screen.findByRole('link', { name: 'Bare id' });

    expect(card('Bare id')).toHaveAttribute('data-hue', 'sky');
    expect(card('Hex')).toHaveAttribute('data-hue', 'sky');
  });
});

describe('BoardDashboard tile owner', () => {
  it('shows the owner on the tile, named for assistive technology and coloured by their id', async () => {
    renderDashboard();
    await screen.findByRole('link', { name: 'Launch Plan' });

    const tile = card('Launch Plan');
    expect(within(tile).getByText('Owner: Ada Lovelace')).toBeInTheDocument();
    expect(within(tile).getByText('AL').parentElement).toHaveClass(MID_BACKGROUND[hueFromSeed('user-1')]);
  });

  it('shows no owner when the board carries only an id', async () => {
    mockedBoardService.getAll.mockResolvedValue([makeBoard({ _id: 'board-bare', title: 'Bare', createdBy: 'user-9' })]);

    renderDashboard();
    await screen.findByRole('link', { name: 'Bare' });

    expect(within(card('Bare')).queryByText(/^Owner:/)).not.toBeInTheDocument();
  });
});

describe('BoardDashboard hero', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  // Only the clock is faked: the query client and user-event run on timers and
  // would never settle under a fully faked one.
  const at = (iso: string) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(iso));
  };

  it.each([
    ['2026-10-09T05:00:00', 'Good morning, Ada.'],
    ['2026-10-09T11:59:00', 'Good morning, Ada.'],
    ['2026-10-09T12:00:00', 'Good afternoon, Ada.'],
    ['2026-10-09T17:59:00', 'Good afternoon, Ada.'],
    ['2026-10-09T18:00:00', 'Good evening, Ada.'],
    ['2026-10-09T02:00:00', 'Good evening, Ada.'],
  ])('at %s the page greets by the part of the day: %s', async (time, greeting) => {
    mockedAuthService.getCurrentUser.mockReturnValue({
      _id: 'user-1',
      firstName: 'Ada',
      lastName: 'Lovelace',
      avatar: '',
    });
    at(time);

    renderDashboard();

    expect(await screen.findByRole('heading', { level: 1, name: greeting })).toBeInTheDocument();
  });

  it('greets nobody by name when there is no session to read', async () => {
    at('2026-10-09T09:00:00');

    renderDashboard();

    expect(await screen.findByRole('heading', { level: 1, name: 'Good morning.' })).toBeInTheDocument();
  });

  it('greets nobody by name when the stored session cannot be read', async () => {
    mockedAuthService.getCurrentUser.mockImplementation(() => {
      throw new Error('corrupt session');
    });
    at('2026-10-09T09:00:00');

    renderDashboard();

    expect(await screen.findByRole('heading', { level: 1, name: 'Good morning.' })).toBeInTheDocument();
  });

  it('writes the date as an eyebrow above the greeting', async () => {
    at('2026-10-09T09:00:00');

    renderDashboard();

    expect(await screen.findByText('FRIDAY · OCTOBER 9')).toBeInTheDocument();
  });

  it('is the one level 1 heading on the page', async () => {
    renderDashboard();
    await screen.findByRole('link', { name: 'Launch Plan' });

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('opens the first board of the list from the hero', async () => {
    renderDashboard();
    await screen.findByRole('link', { name: 'Launch Plan' });

    const overview = within(hero());
    expect(overview.getByRole('link', { name: 'Open Launch Plan' })).toHaveAttribute('href', '/board/board-launch');
  });

  it('shows the four totals it was given inside the hero', async () => {
    renderDashboard();
    await screen.findByRole('link', { name: 'Launch Plan' });

    const overview = within(hero());
    const figures: [string, string][] = [
      ['Total Boards', '7'],
      ['Team Members', '12'],
      ['Total Tasks', '34'],
      ['Avg Progress', '58%'],
    ];
    for (const [label, value] of figures) {
      // The label is the term and the number its description, so a screen
      // reader reads them as a pair.
      expect(overview.getByText(label).nextElementSibling).toHaveTextContent(new RegExp(`^${value}$`));
    }
  });
});

describe('BoardDashboard board count and new board tile', () => {
  it('says how many boards there are', async () => {
    renderDashboard();

    expect(await screen.findByText('2 boards')).toBeInTheDocument();
  });

  it('says "1 board" for one', async () => {
    mockedBoardService.getAll.mockResolvedValue([BOARDS[0]]);

    renderDashboard();

    expect(await screen.findByText('1 board')).toBeInTheDocument();
  });

  it('ends the grid with a tile that opens the create board dialog', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await screen.findByRole('link', { name: 'Launch Plan' });

    const tile = screen.getByText('Fresh board, ready for take-off.').closest('button') as HTMLElement;
    await user.click(tile);

    expect(openCreateBoard).toHaveBeenCalledTimes(1);
  });
});

describe('BoardDashboard states with nothing to list', () => {
  it('waits rather than showing an empty dashboard while the boards are loading', async () => {
    mockedBoardService.getAll.mockReturnValue(new Promise(() => {}));

    renderDashboard();

    expect(await screen.findByRole('status', { name: 'Loading boards...' })).toBeInTheDocument();
    expect(screen.queryByText('No boards yet')).not.toBeInTheDocument();
  });

  it('offers a way to start when the account has no boards at all', async () => {
    mockedBoardService.getAll.mockResolvedValue([]);

    renderDashboard();

    expect(await screen.findByText('No boards yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Your First Board' })).toBeInTheDocument();
    // The empty state is the way to start, so the tile that would repeat it is not drawn.
    expect(screen.queryByText('Fresh board, ready for take-off.')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^Open / })).not.toBeInTheDocument();
  });

  it('says so and offers a reload when the boards cannot be read', async () => {
    mockedBoardService.getAll.mockRejectedValue(new Error('network down'));

    renderDashboard();

    expect(await screen.findByText('Failed to load data. Please try again later.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload Page' })).toBeInTheDocument();
  });
});

describe('BoardDashboard per board menu', () => {
  const openMenu = async (user: ReturnType<typeof userEvent.setup>, title: string) => {
    renderDashboard();
    await screen.findByRole('link', { name: title });
    await user.click(screen.getByRole('button', { name: `Options for ${title}` }));
  };

  it('offers adding a member and deleting the board', async () => {
    const user = userEvent.setup();
    await openMenu(user, 'Launch Plan');

    expect(screen.getByRole('button', { name: /Add Member/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Delete/ })).toBeInTheDocument();
  });

  it('says whether it is open on the button that opens it', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await screen.findByRole('link', { name: 'Launch Plan' });
    const trigger = screen.getByRole('button', { name: 'Options for Launch Plan' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await user.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('is not offered on a board the viewer is only a member of, where the server refuses both actions', async () => {
    mockedBoardService.getAll.mockResolvedValue([
      makeBoard({ _id: 'board-mine', title: 'Mine', viewerRole: 'owner' }),
      makeBoard({ _id: 'board-theirs', title: 'Theirs', viewerRole: 'member' }),
      makeBoard({ _id: 'board-unknown', title: 'Unknown', viewerRole: undefined }),
    ]);

    renderDashboard();
    await screen.findByRole('link', { name: 'Theirs' });

    expect(screen.getByRole('button', { name: 'Options for Mine' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Options for Theirs' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Options for Unknown' })).not.toBeInTheDocument();
    // Still a board the viewer can open.
    expect(screen.getByRole('link', { name: 'Theirs' })).toHaveAttribute('href', '/board/board-theirs');
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    await openMenu(user, 'Launch Plan');

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('button', { name: /Add Member/ })).not.toBeInTheDocument());
  });

  it('closes when the click lands anywhere else', async () => {
    const user = userEvent.setup();
    await openMenu(user, 'Launch Plan');

    await user.click(screen.getByRole('heading', { name: 'Your boards' }));

    await waitFor(() => expect(screen.queryByRole('button', { name: /Add Member/ })).not.toBeInTheDocument());
  });

  it('moves the open menu to the board whose options were clicked', async () => {
    const user = userEvent.setup();
    await openMenu(user, 'Launch Plan');

    await user.click(screen.getByRole('button', { name: 'Options for Hiring' }));

    // Both halves are needed. Counting the menus alone cannot tell a menu
    // that moved from one that simply refused to, since either way there is
    // exactly one on the page.
    expect(screen.getAllByRole('button', { name: /Add Member/ })).toHaveLength(1);
    expect(within(card('Hiring')).getByRole('button', { name: /Add Member/ })).toBeInTheDocument();
  });
});

describe('BoardDashboard deletion', () => {
  const askToDelete = async (user: ReturnType<typeof userEvent.setup>, title = 'Launch Plan') => {
    renderDashboard();
    await screen.findByRole('link', { name: title });
    await user.click(screen.getByRole('button', { name: `Options for ${title}` }));
    await user.click(screen.getByRole('button', { name: /^Delete$/ }));
    return screen.findByRole('dialog', { name: 'Delete this board?' });
  };

  const confirm = (user: ReturnType<typeof userEvent.setup>) =>
    user.click(screen.getByRole('button', { name: 'Delete board' }));

  // Deleting a board takes every task on it out of sight, so the confirmation
  // is what stands between a misclick and losing them.
  it('asks first, naming the board, and deletes nothing when it is declined', async () => {
    const user = userEvent.setup();

    const dialog = await askToDelete(user);
    expect(dialog).toHaveTextContent('Launch Plan');

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(mockedBoardService.delete).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    // The menu stays open behind the dialog, so focus has somewhere to return.
    expect(screen.getByRole('button', { name: /^Delete$/ })).toHaveFocus();
  });

  it('leaves the menu open when Escape closes the dialog, so focus has an item to return to', async () => {
    const user = userEvent.setup();

    await askToDelete(user);
    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: /^Delete$/ })).toHaveFocus();
  });

  it('deletes the board that the menu was opened on once confirmed, and offers Undo', async () => {
    const user = userEvent.setup();

    await askToDelete(user);
    await confirm(user);

    await waitFor(() => expect(mockedBoardService.delete).toHaveBeenCalledWith('board-launch'));
    expect(await screen.findByRole('button', { name: 'Undo' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Deleted "Launch Plan"');
    // Left open it would reopen over the card if the board were restored.
    expect(screen.queryByRole('button', { name: /^Delete$/ })).not.toBeInTheDocument();
  });

  it('restores the board when Undo is pressed', async () => {
    mockedBoardService.restore.mockResolvedValue(BOARDS[0]);
    const user = userEvent.setup();

    await askToDelete(user);
    await confirm(user);
    await user.click(await screen.findByRole('button', { name: 'Undo' }));

    await waitFor(() => expect(mockedBoardService.restore).toHaveBeenCalledWith('board-launch'));
    expect(await screen.findByText('Restored "Launch Plan"')).toBeInTheDocument();
  });

  it('says so and keeps the board listed when the delete fails', async () => {
    mockedBoardService.delete.mockRejectedValue(new Error('refused'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const user = userEvent.setup();

    await askToDelete(user);
    await confirm(user);

    expect(await screen.findByText('Failed to delete board. Please try again.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
  });

  // Deleting a board is not instant. With no sign that it started, the only
  // thing the person can do is click again, and every click is another
  // request against the same board.
  it('says the delete is under way and refuses a second click while it is', async () => {
    mockedBoardService.delete.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();

    await askToDelete(user);
    await confirm(user);

    const deleting = await screen.findByRole('button', { name: /Deleting/ });
    expect(deleting).toBeDisabled();
    expect(mockedBoardService.delete).toHaveBeenCalledTimes(1);
  });

  // The in-flight state belongs to the board being deleted, not to the page.
  it('leaves the other boards deletable while one is being deleted', async () => {
    mockedBoardService.delete.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();

    await askToDelete(user);
    await confirm(user);
    await screen.findByRole('button', { name: /Deleting/ });

    await user.click(screen.getByRole('button', { name: 'Options for Hiring' }));

    expect(screen.getByRole('button', { name: /^Delete$/ })).toBeEnabled();
  });
});
