import React, { useState } from 'react';
import { motion } from 'motion/react';
import { IconFolder, IconPlus } from '@tabler/icons-react';
import { BoardCard, BoardStats, DeleteBoardDialog, useBoardDashboard, useBoardMenu } from '@/features/boards';
import { resolveColor } from '@/features/colors';
import { AddMemberModal } from '@/features/users';
import type { Board, User } from '@/models';
import { Button, EmptyState, LoadingScreen, Icon } from '@/shared/ui';
import { ShellAction } from '@/app/layouts/shell/ShellAction';
import { useShell } from '@/app/layouts/shell/shellContext';
import PageHeader from '../components/PageHeader';

const BoardDashboard: React.FC = () => {
  const [memberBoard, setMemberBoard] = useState<Board | null>(null);
  const [boardToDelete, setBoardToDelete] = useState<Board | null>(null);

  const dashboard = useBoardDashboard();
  const menu = useBoardMenu();
  const shell = useShell();
  const createBoard = () => shell?.openCreateBoard();

  const handleAddMembers = async (members: User[]) => {
    if (!memberBoard) return;
    await dashboard.addMembers(memberBoard._id, members);
    setMemberBoard(null);
  };

  const openAddMember = (boardId: string) => {
    setMemberBoard(dashboard.boards.find(board => board._id === boardId) ?? null);
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
          <div role="alert" className="mb-4 rounded-control bg-danger-bg p-4 text-danger">
            {dashboard.error}
          </div>
          <Button type="button" onClick={() => window.location.reload()}>
            Reload Page
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader title="My Boards" subtitle="Manage and organize your project boards" />

      <ShellAction>
        <Button type="button" size="sm" onClick={createBoard} leftIcon={<Icon as={IconPlus} size={18} />}>
          New board
        </Button>
      </ShellAction>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="pt-2">
        <BoardStats stats={dashboard.stats} />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {dashboard.boards.map((board, index) => (
            // `_id` is required on the model and the API always sends it. The
            // fallback this replaced ended in `temp-${Date.now()}`, which gave
            // every render a different React key and defeated reconciliation
            // for the whole grid. Finding P2-8.
            <BoardCard
              key={board._id}
              board={board}
              color={resolveColor(board.color, dashboard.colorLookup)}
              delay={index * 0.08}
              menuOpen={menu.isOpen(board._id)}
              isDeleting={dashboard.isDeleting(board._id)}
              onToggleMenu={() => menu.toggle(board._id)}
              onAddMember={() => openAddMember(board._id)}
              onDelete={() => setBoardToDelete(board)}
            />
          ))}
        </div>

        {dashboard.boards.length === 0 && (
          <EmptyState
            icon={<Icon as={IconFolder} className="text-ink-tertiary" size={24} />}
            title="No boards yet"
            description="Create your first board to get started with project management"
            action={
              <Button type="button" onClick={createBoard}>
                Create Your First Board
              </Button>
            }
          />
        )}
      </motion.div>

      <DeleteBoardDialog
        board={boardToDelete}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setBoardToDelete(null)}
      />

      <AddMemberModal
        open={memberBoard !== null}
        onClose={() => setMemberBoard(null)}
        onAddMembers={handleAddMembers}
        boardTitle={memberBoard?.title ?? ''}
        boardId={memberBoard?._id ?? ''}
      />
    </div>
  );
};

export default BoardDashboard;
