import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithQuery } from '@/test/renderWithQuery';
import { ColorService } from '@/services';
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

describe('BoardHeader menu', () => {
  it('has the board menu for the owner and none for a member', async () => {
    const { unmount } = renderHeader(makeBoard());
    expect(await screen.findByRole('button', { name: 'Options for Launch Plan' })).toBeInTheDocument();
    unmount();

    renderHeader(makeBoard({ viewerRole: 'member' }));
    expect(within(document.body).queryByRole('button', { name: /options for/i })).not.toBeInTheDocument();
  });
});
