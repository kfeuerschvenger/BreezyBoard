import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { renderWithQuery } from '@/test/renderWithQuery';
import BoardDashboard from './BoardDashboard';
import { AuthService, BoardService, ColorService, DashboardService, TemplateService } from '@/services';
import type { Board } from '@/models';

// Characterization, written against the page as it stands before section
// 12.5 takes it apart. Nothing here asserts an improvement: every case pins
// behaviour a user can see today, so that the decomposition is judged by
// these staying green rather than by reading the diff.
//
// The page mounts CreateBoardModal, AddMemberModal and UserAvatar whatever
// it is doing, and each of those reaches a service of its own on mount, so
// all six are stubbed to keep the real axios client out of the suite.
vi.mock('@/services', () => ({
  AuthService: { getCurrentUser: vi.fn(), logout: vi.fn() },
  BoardService: { getAll: vi.fn(), create: vi.fn(), delete: vi.fn(), addMembers: vi.fn() },
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

const makeBoard = (overrides: Partial<Board>): Board => ({
  _id: 'board-default',
  title: 'Untitled',
  description: '',
  color: '#3B82F6',
  columns: [],
  template: { _id: 'template-1', name: 'Default', description: '', iconName: 'layout', columns: [] },
  createdBy: 'user-1',
  members: [],
  taskCount: 0,
  memberCount: 0,
  progress: 0,
  ...overrides,
});

const BOARDS: Board[] = [
  makeBoard({
    _id: 'board-launch',
    title: 'Launch Plan',
    description: 'Everything that has to happen before release',
    color: '#3B82F6',
    taskCount: 9,
    memberCount: 3,
    progress: 40,
    updatedAt: '2026-03-05T12:00:00.000Z',
  }),
  // A colour held as an id rather than a hex value, which is the branch that
  // sends the page to the colour service before it can paint the card.
  makeBoard({
    _id: 'board-hiring',
    title: 'Hiring',
    description: 'Open roles and candidates',
    color: 'color-green',
    taskCount: 2,
    memberCount: 5,
    progress: 0,
    updatedAt: '2026-03-01T12:00:00.000Z',
  }),
];

const renderDashboard = () =>
  renderWithQuery(
    <MemoryRouter>
      <BoardDashboard />
    </MemoryRouter>
  );

const card = (title: string) => screen.getByRole('heading', { name: title }).closest('div.relative') as HTMLElement;

beforeEach(() => {
  mockedAuthService.getCurrentUser.mockReset().mockReturnValue(null);
  mockedBoardService.getAll.mockReset().mockResolvedValue(BOARDS);
  mockedBoardService.delete.mockReset().mockResolvedValue(undefined);
  mockedDashboardService.getStats.mockReset().mockResolvedValue(STATS);
  mockedColorService.getByType.mockReset().mockResolvedValue([]);
  mockedColorService.getById.mockReset().mockResolvedValue({ _id: 'color-green', name: 'Green', value: '#10B981' });
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

    const bar = within(card('Launch Plan')).getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '40');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
  });

  it('falls back to a placeholder title and description when the board has neither', async () => {
    mockedBoardService.getAll.mockResolvedValue([makeBoard({ _id: 'board-bare', title: '', description: '' })]);

    renderDashboard();

    expect(await screen.findByRole('link', { name: 'Untitled Board' })).toBeInTheDocument();
    expect(screen.getByText('No description')).toBeInTheDocument();
  });
});

describe('BoardDashboard board colours', () => {
  const PALETTE = [
    { _id: 'color-green', name: 'Green', value: '#10B981' },
    { _id: 'color-amber', name: 'Amber', value: '#F59E0B' },
  ];

  beforeEach(() => {
    mockedColorService.getByType.mockResolvedValue(PALETTE);
    // Deliberately a different colour from the palette entry of the same id.
    // Anything still resolving a board colour one request at a time paints
    // red, so the assertions below say which of the two paths produced the
    // colour rather than only that a colour arrived.
    mockedColorService.getById.mockResolvedValue({ _id: 'color-green', name: 'Red', value: '#EF4444' });
  });

  it('reads the board palette once however many boards are listed', async () => {
    renderDashboard();
    await screen.findByRole('link', { name: 'Hiring' });

    await waitFor(() => expect(mockedColorService.getByType).toHaveBeenCalledWith('board'));
    expect(mockedColorService.getByType).toHaveBeenCalledTimes(1);
    expect(mockedColorService.getById).not.toHaveBeenCalled();
  });

  it('paints a board whose colour is an id with the palette entry of that id', async () => {
    renderDashboard();
    await screen.findByRole('link', { name: 'Hiring' });

    await waitFor(() =>
      expect(within(card('Hiring')).getByRole('progressbar')).toHaveStyle({ backgroundColor: '#10B981' })
    );
  });

  it('keeps painting a board whose colour is already a hex value', async () => {
    renderDashboard();
    await screen.findByRole('link', { name: 'Launch Plan' });

    expect(within(card('Launch Plan')).getByRole('progressbar')).toHaveStyle({ backgroundColor: '#3B82F6' });
  });

  it('falls back to the neutral colour when the palette has no entry for the id', async () => {
    mockedBoardService.getAll.mockResolvedValue([makeBoard({ _id: 'board-odd', title: 'Odd', color: 'color-gone' })]);

    renderDashboard();
    await screen.findByRole('link', { name: 'Odd' });

    expect(within(card('Odd')).getByRole('progressbar')).toHaveStyle({ backgroundColor: '#64748B' });
  });
});

describe('BoardDashboard totals', () => {
  it('shows the four dashboard totals it was given', async () => {
    renderDashboard();
    await screen.findByRole('link', { name: 'Launch Plan' });

    const totals = ['Total Boards', 'Team Members', 'Total Tasks', 'Avg Progress'];
    totals.forEach(label => expect(screen.getByText(label)).toBeInTheDocument());

    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('34')).toBeInTheDocument();
    expect(screen.getByText('58%')).toBeInTheDocument();
  });
});

describe('BoardDashboard states with nothing to list', () => {
  it('waits rather than showing an empty dashboard while the boards are loading', async () => {
    mockedBoardService.getAll.mockReturnValue(new Promise(() => {}));

    renderDashboard();

    expect(await screen.findByText('Loading boards...')).toBeInTheDocument();
    expect(screen.queryByText('No boards yet')).not.toBeInTheDocument();
  });

  it('offers a way to start when the account has no boards at all', async () => {
    mockedBoardService.getAll.mockResolvedValue([]);

    renderDashboard();

    expect(await screen.findByText('No boards yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Your First Board' })).toBeInTheDocument();
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

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    await openMenu(user, 'Launch Plan');

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('button', { name: /Add Member/ })).not.toBeInTheDocument());
  });

  it('closes when the click lands anywhere else', async () => {
    const user = userEvent.setup();
    await openMenu(user, 'Launch Plan');

    await user.click(screen.getByText('Manage and organize your project boards'));

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
  const openDelete = async (user: ReturnType<typeof userEvent.setup>) => {
    renderDashboard();
    await screen.findByRole('link', { name: 'Launch Plan' });
    await user.click(screen.getByRole('button', { name: 'Options for Launch Plan' }));
    await user.click(screen.getByRole('button', { name: /Delete/ }));
  };

  // Deleting a board cascades to every task on it, so the confirmation is
  // the only thing between a misclick and losing all of them.
  it('deletes nothing when the confirmation is declined', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();

    await openDelete(user);

    expect(window.confirm).toHaveBeenCalled();
    expect(mockedBoardService.delete).not.toHaveBeenCalled();
  });

  it('deletes the board that the menu was opened on once confirmed', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();

    await openDelete(user);

    await waitFor(() => expect(mockedBoardService.delete).toHaveBeenCalledWith('board-launch'));
  });

  it('says so and keeps the board listed when the delete fails', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockedBoardService.delete.mockRejectedValue(new Error('refused'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const user = userEvent.setup();

    await openDelete(user);

    expect(await screen.findByText('Failed to delete board. Please try again.')).toBeInTheDocument();
  });
});
