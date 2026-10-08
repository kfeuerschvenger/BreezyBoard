import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { IconFolder, IconPlus } from '@tabler/icons-react';
import {
  BoardCard,
  BoardStats,
  CreateBoardModal,
  DeleteBoardDialog,
  useBoardDashboard,
  useBoardMenu,
} from '@/features/boards';
import { resolveColor } from '@/features/colors';
import { AddMemberModal } from '@/features/users';
import type { NewBoard } from '@/features/boards';
import type { Board, User } from '@/models';
import { EmptyState, LoadingScreen, Icon } from '@/shared/ui';
import PageHeader from '../components/PageHeader';
import UserAvatar from '../components/UserAvatar';

const BoardDashboard: React.FC = () => {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [memberBoard, setMemberBoard] = useState<Board | null>(null);
  const [boardToDelete, setBoardToDelete] = useState<Board | null>(null);

  const dashboard = useBoardDashboard();
  const menu = useBoardMenu();

  const handleCreateBoard = async (board: NewBoard) => {
    if (await dashboard.createBoard(board)) setShowCreateModal(false);
  };

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

  if (dashboard.isLoading) return <LoadingScreen label="Loading boards..." showLabel />;

  if (dashboard.error) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="bg-red-100 text-red-700 p-4 rounded-lg mb-4">{dashboard.error}</div>
          <button
            onClick={() => window.location.reload()}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            Reload Page
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <PageHeader title="My Boards" subtitle="Manage and organize your project boards">
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-all duration-200 shadow-lg hover:shadow-xl cursor-pointer"
        >
          <Icon as={IconPlus} size={20} />
          Create Board
        </button>
        <UserAvatar />
      </PageHeader>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-7xl mx-auto p-8">
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
            icon={<Icon as={IconFolder} className="text-gray-400" size={24} />}
            title="No boards yet"
            description="Create your first board to get started with project management"
            action={
              <button
                onClick={() => setShowCreateModal(true)}
                className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors cursor-pointer shadow-lg hover:shadow-xl"
              >
                Create Your First Board
              </button>
            }
          />
        )}
      </motion.div>

      <CreateBoardModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreateBoard={handleCreateBoard}
      />

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
