import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithQuery } from '@/test/renderWithQuery';
import { BoardService, ColorService } from '@/services';
import { hueFromSeed, MID_BACKGROUND } from '@/shared/ui';
import type { Board, Color, User } from '@/models';
import { BoardHeader } from './BoardHeader';

vi.mock('@/services', () => ({
  BoardService: { update: vi.fn(), getAll: vi.fn(), getById: vi.fn(), delete: vi.fn(), restore: vi.fn() },
  ColorService: { getByType: vi.fn() },
  DashboardService: { getStats: vi.fn() },
}));

const GREEN: Color = { _id: 'color-green', name: 'Green', value: 'green' };
const ADA: User = { _id: 'user-ada', firstName: 'Ada', lastName: 'Lovelace', avatar: '' };

const makeBoard = (overrides: Partial<Board> = {}): Board => ({
  _id: 'board-1',
  title: 'Launch Plan',
  description: 'Everything for the launch',
  color: GREEN,
  columns: [],
  template: 'template-1',
  createdBy: ADA,
  members: [ADA, { _id: 'user-grace', firstName: 'Grace', lastName: 'Hopper', avatar: '' }],
  taskCount: 0,
  memberCount: 2,
  progress: 0,
  viewerRole: 'owner',
  ...overrides,
});

beforeEach(() => {
  vi.mocked(ColorService.getByType).mockReset().mockResolvedValue([GREEN]);
});

const renderHeader = (board: Board, landed = 1, total = 4) =>
  renderWithQuery(<BoardHeader board={board} landed={landed} total={total} onDeleted={vi.fn()} />);

describe('BoardHeader', () => {
  it('names the board in the one h1 and describes it under it', () => {
    renderHeader(makeBoard());

    expect(screen.getByRole('heading', { level: 1, name: 'Launch Plan' })).toBeInTheDocument();
    expect(screen.getByText('Everything for the launch')).toBeInTheDocument();
  });

  it('draws no description when there is none, and an untitled board as one', () => {
    renderHeader(makeBoard({ title: '', description: '' }));

    expect(screen.getByRole('heading', { level: 1, name: 'Untitled Board' })).toBeInTheDocument();
    expect(document.querySelector('header p.line-clamp-2')).toBeNull();
  });

  // A `header` is a banner landmark only outside sectioning content, and the
  // shell already holds the page's one banner. jsdom does not apply that rule,
  // so what is asserted is the markup that makes the browser apply it: a plain
  // `header` with no role of its own, inside `main`. The accessibility gate
  // scans the page and would report a second banner.
  it('is a plain header inside the page, with no landmark role of its own', () => {
    renderWithQuery(
      <main>
        <BoardHeader board={makeBoard()} landed={1} total={4} onDeleted={vi.fn()} />
      </main>,
    );

    const header = document.querySelector('main header[data-board-header]');
    expect(header).not.toBeNull();
    expect(header).not.toHaveAttribute('role');
  });
});

describe('BoardHeader progress', () => {
  it('says how many have landed, as words and as a percentage', () => {
    renderHeader(makeBoard(), 1, 4);

    expect(screen.getByText('1 of 4 landed')).toBeInTheDocument();
    expect(screen.getByText('25%')).toBeInTheDocument();
  });

  it('rounds the percentage to a whole number', () => {
    renderHeader(makeBoard(), 1, 3);

    expect(screen.getByText('33%')).toBeInTheDocument();
  });

  it('is zero for a board with nothing on it, not not-a-number', () => {
    renderHeader(makeBoard(), 0, 0);

    expect(screen.getByText('0 of 0 landed')).toBeInTheDocument();
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('is a progress bar that is named for the board and says the same in words', () => {
    renderHeader(makeBoard(), 3, 4);

    const bar = screen.getByRole('progressbar', { name: 'Progress of Launch Plan' });
    expect(bar).toHaveAttribute('aria-valuenow', '3');
    expect(bar).toHaveAttribute('aria-valuemax', '4');
    expect(bar).toHaveAttribute('aria-valuetext', '3 of 4 landed');
  });

  it('keeps the bar valid when there is nothing to count', () => {
    renderHeader(makeBoard(), 0, 0);

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '1');
  });

  it('is full when everything has landed', () => {
    renderHeader(makeBoard(), 5, 5);

    expect(screen.getByText('100%')).toBeInTheDocument();
  });
});

describe('BoardHeader owner', () => {
  it('shows one person, the owner, named for assistive technology', () => {
    renderHeader(makeBoard());

    expect(screen.getByText('Owner: Ada Lovelace')).toBeInTheDocument();
    expect(screen.queryByText(/Grace/)).not.toBeInTheDocument();
    expect(document.querySelectorAll('header .rounded-full')).toHaveLength(1);
  });

  // The fill follows the id, so the owner is the colour they have been seen in
  // on the dashboard and in every card.
  it('seeds the avatar with the owner id', () => {
    renderHeader(makeBoard());

    const avatar = screen.getByText('AL').parentElement as HTMLElement;
    expect(avatar).toHaveClass(MID_BACKGROUND[hueFromSeed(ADA._id)]);
  });

  it('shows no one when the board only carries the id of its owner', () => {
    renderHeader(makeBoard({ createdBy: 'user-ada' }));

    expect(screen.queryByText(/Owner:/)).not.toBeInTheDocument();
  });
});

describe('BoardHeader title in place', () => {
  const titleField = () => screen.getByRole('textbox', { name: 'Board name' });

  it('gives the owner the name as a field inside the one h1', () => {
    renderHeader(makeBoard());

    expect(screen.getByRole('heading', { level: 1, name: 'Launch Plan' })).toContainElement(titleField());
    expect(titleField()).toHaveValue('Launch Plan');
  });

  it('shows the owner a long name in full, wrapped, as a member reads it', () => {
    const long = 'A launch plan for the whole of the second half of the year, with every team and every deadline in it';
    renderHeader(makeBoard({ title: long }));

    expect(titleField().tagName).toBe('TEXTAREA');
    expect(titleField()).toHaveValue(long);
    expect(titleField()).not.toHaveClass('truncate');
  });

  it('gives a member the name as text', () => {
    renderHeader(makeBoard({ viewerRole: 'member' }));

    expect(screen.getByRole('heading', { level: 1, name: 'Launch Plan' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('saves the new name, and only it, when the field loses focus', async () => {
    vi.mocked(BoardService.update).mockReset().mockResolvedValue(makeBoard({ title: 'Relaunch Plan' }));
    renderHeader(makeBoard());

    await userEvent.clear(titleField());
    await userEvent.type(titleField(), 'Relaunch Plan');
    await userEvent.tab();

    await waitFor(() => expect(BoardService.update).toHaveBeenCalledExactlyOnceWith('board-1', { title: 'Relaunch Plan' }));
  });

  it('saves on Enter and reverts on Escape without a request', async () => {
    vi.mocked(BoardService.update).mockReset().mockResolvedValue(makeBoard({ title: 'Relaunch Plan' }));
    renderHeader(makeBoard());

    await userEvent.clear(titleField());
    await userEvent.type(titleField(), 'Discarded{Escape}');
    expect(titleField()).toHaveValue('Launch Plan');
    expect(BoardService.update).not.toHaveBeenCalled();

    await userEvent.clear(titleField());
    await userEvent.type(titleField(), 'Relaunch Plan{Enter}');
    await waitFor(() => expect(BoardService.update).toHaveBeenCalledTimes(1));
  });

  it('keeps the name and tells the person when it is emptied', async () => {
    vi.mocked(BoardService.update).mockReset();
    renderHeader(makeBoard());

    await userEvent.clear(titleField());
    await userEvent.tab();

    expect(BoardService.update).not.toHaveBeenCalled();
    expect(titleField()).toHaveValue('Launch Plan');
    expect(await screen.findByText('A board needs a name.')).toBeInTheDocument();
  });

  it('goes back to the old name and tells the person when the save fails', async () => {
    vi.mocked(BoardService.update).mockReset().mockRejectedValue(new Error('offline'));
    renderHeader(makeBoard());

    await userEvent.clear(titleField());
    await userEvent.type(titleField(), 'Relaunch Plan');
    await userEvent.tab();

    expect(await screen.findByText('The board could not be renamed. Nothing was changed.')).toBeInTheDocument();
    expect(titleField()).toHaveValue('Launch Plan');
  });
});

describe('BoardHeader Add column', () => {
  const renderWithCounts = (board: Board, counts: Record<string, number> | null = {}) =>
    renderWithQuery(
      <BoardHeader board={board} landed={0} total={0} onDeleted={vi.fn()} taskCounts={counts ?? undefined} />
    );

  const withColumns = (overrides: Partial<Board> = {}) =>
    makeBoard({
      columns: [
        { _id: 'col-a', title: 'Backlog', color: GREEN, order: 0 },
        { _id: 'col-b', title: 'Done', color: GREEN, order: 1 },
      ],
      ...overrides,
    });

  it('is a button of the owner, beside the board menu', async () => {
    renderWithCounts(withColumns());

    expect(await screen.findByRole('button', { name: 'Add column' })).toBeInTheDocument();
  });

  it('is not offered to a member, or where the page holds no cards to count', () => {
    const { unmount } = renderWithCounts(withColumns({ viewerRole: 'member' }));
    expect(screen.queryByRole('button', { name: 'Add column' })).not.toBeInTheDocument();
    unmount();

    renderWithCounts(withColumns(), null);
    expect(screen.queryByRole('button', { name: 'Add column' })).not.toBeInTheDocument();
  });

  it('opens the edit dialog on its columns section, with the cursor in the name of the new column', async () => {
    renderWithCounts(withColumns());

    await userEvent.click(await screen.findByRole('button', { name: 'Add column' }));

    const dialog = await screen.findByRole('dialog', { name: 'Edit board' });
    expect(within(dialog).getByRole('heading', { name: 'Columns' })).toBeInTheDocument();
    await waitFor(() => expect(within(dialog).getByRole('textbox', { name: 'New column name' })).toHaveFocus());
  });

  it('is not what the board menu opens: Edit board leaves the cursor out of the new column field', async () => {
    renderWithCounts(withColumns());

    await userEvent.click(await screen.findByRole('button', { name: 'Options for Launch Plan' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Edit board' }));

    const dialog = await screen.findByRole('dialog', { name: 'Edit board' });
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(within(dialog).getByRole('textbox', { name: 'New column name' })).not.toHaveFocus();
  });
});

describe('BoardHeader menu', () => {
  it('has the board menu for the owner and none for a member', async () => {
    const { unmount } = renderHeader(makeBoard());
    expect(await screen.findByRole('button', { name: 'Options for Launch Plan' })).toBeInTheDocument();
    unmount();

    renderHeader(makeBoard({ viewerRole: 'member' }));
    expect(within(document.body).queryByRole('button', { name: /options for/i })).not.toBeInTheDocument();
  });
});
