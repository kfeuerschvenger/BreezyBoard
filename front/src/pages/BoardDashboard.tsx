import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { IconFolder, IconPlus } from '@tabler/icons-react';
import {
  BoardCard,
  DeleteBoardDialog,
  HomeHero,
  NewBoardTile,
  eyebrowFor,
  greetingFor,
  useAddMembersFlow,
  useBoardDashboard,
  useBoardMenu,
} from '@/features/boards';
import { AddMemberModal } from '@/features/users';
import type { Board } from '@/models';
import { AuthService } from '@/services';
import { Button, EmptyState, LoadingScreen, Icon } from '@/shared/ui';
import { ShellAction } from '@/app/layouts/shell/ShellAction';
import { useShell } from '@/app/layouts/shell/shellContext';

/**
 * The first name to greet somebody by, read from the stored session. A
 * session that cannot be read greets nobody by name rather than taking the
 * page down.
 */
const firstNameOfSession = (): string | undefined => {
  try {
    return AuthService.getCurrentUser()?.firstName;
  } catch {
    return undefined;
  }
};

/** The sentence under the greeting. It reads what the data holds today: boards, and nothing about due dates. */
const lineFor = (boardCount: number): string =>
  boardCount === 0
    ? 'Clear skies: no boards yet. Start one and catch an idea.'
    : "The wind's in your favor. Pick up where you left off.";

/** The fragment that names the grid of boards: the target of the breadcrumb's "Boards" entry. */
const BOARDS_HASH = '#boards';

/**
 * Takes the person to the grid of boards when the address names it.
 *
 * React Router changes the address on a hash link and leaves the scroll
 * alone, so the page does it: the heading scrolls into view, smoothly unless
 * the operating system asks for reduced motion, and takes focus without a
 * second scroll, so the next Tab starts inside the grid and a screen reader
 * starts reading at "Your boards". It runs again on every navigation to the
 * fragment, `key` included, because the same address pressed twice is a new
 * navigation that the hash alone would not show. `ready` holds it back until
 * the grid is on screen.
 */
const useScrollToBoards = (ready: boolean) => {
  const { hash, key } = useLocation();
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!ready || hash !== BOARDS_HASH || !heading.current) return;

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    heading.current.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    heading.current.focus({ preventScroll: true });
  }, [ready, hash, key]);

  return heading;
};

const BoardDashboard: React.FC = () => {
  const [boardToDelete, setBoardToDelete] = useState<Board | null>(null);

  const dashboard = useBoardDashboard();
  const boardsHeading = useScrollToBoards(!dashboard.isLoading && !dashboard.error);
  const addMembers = useAddMembersFlow();
  const menu = useBoardMenu();
  const shell = useShell();
  const createBoard = () => shell?.openCreateBoard();

  const openAddMember = (board: Board) => {
    addMembers.open(board);
    menu.close();
  };

  // Asked here rather than in the hook: whether to ask before deleting is a
  // question about this screen, not about the write. The menu stays open
  // behind the dialog, which is what lets the card say "Deleting..." while
  // the request runs, and it closes once the board is gone: left open, it
  // would reopen over the card if the board were restored.
  const confirmDelete = async () => {
    const board = boardToDelete;
    setBoardToDelete(null);
    if (!board) return;

    await dashboard.deleteBoard(board);
    menu.close();
  };

  if (dashboard.isLoading) return <LoadingScreen label="Loading boards..." showLabel fill="parent" />;

  if (dashboard.error) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="max-w-md text-center">
          <div role="alert" className="mb-4 rounded-control bg-danger-bg p-4 text-danger-strong">
            {dashboard.error}
          </div>
          <Button type="button" onClick={() => window.location.reload()}>
            Reload Page
          </Button>
        </div>
      </div>
    );
  }

  const now = new Date();
  const { boards } = dashboard;
  const firstBoard = boards[0];

  return (
    <div className="mx-auto flex w-full max-w-310 animate-bb-view flex-col gap-7.5 pb-8">
      <ShellAction>
        <Button type="button" size="sm" onClick={createBoard} leftIcon={<Icon as={IconPlus} size={18} />}>
          New board
        </Button>
      </ShellAction>

      <HomeHero
        eyebrow={eyebrowFor(now)}
        greeting={greetingFor(now, firstNameOfSession())}
        line={lineFor(boards.length)}
        stats={dashboard.stats}
        firstBoard={firstBoard ? { _id: firstBoard._id, title: firstBoard.title || 'Untitled Board' } : undefined}
      />

      <section id="boards" aria-labelledby="home-boards-heading">
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <h2
            id="home-boards-heading"
            ref={boardsHeading}
            tabIndex={-1}
            className="font-heading text-2xl font-[650] tracking-[-0.02em] text-ink outline-none"
          >
            Your boards
          </h2>
          <span className="font-mono text-xs text-ink-tertiary">
            {boards.length} {boards.length === 1 ? 'board' : 'boards'}
          </span>
        </div>

        {boards.length > 0 ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
            {boards.map((board, index) => (
              // `_id` is required on the model and the API always sends it. A
              // key built from `Date.now()` would be different on every render
              // and defeat reconciliation for the whole grid.
              <BoardCard
                key={board._id}
                board={board}
                delay={index * 0.06}
                menuOpen={menu.isOpen(board._id)}
                isDeleting={dashboard.isDeleting(board._id)}
                onToggleMenu={() => menu.toggle(board._id)}
                onAddMember={() => openAddMember(board)}
                onDelete={() => setBoardToDelete(board)}
              />
            ))}
            <NewBoardTile onClick={createBoard} delay={boards.length * 0.06} />
          </div>
        ) : (
          <EmptyState
            icon={<Icon as={IconFolder} size={24} />}
            title="No boards yet"
            description="Create your first board to get started with project management"
            action={
              <Button type="button" onClick={createBoard}>
                Create Your First Board
              </Button>
            }
          />
        )}
      </section>

      <DeleteBoardDialog
        board={boardToDelete}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setBoardToDelete(null)}
      />

      <AddMemberModal {...addMembers.dialogProps} />
    </div>
  );
};

export default BoardDashboard;
