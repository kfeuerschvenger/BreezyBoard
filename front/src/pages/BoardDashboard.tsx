import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Folder } from 'lucide-react';
import CreateBoardModal from '../components/CreateBoardModal';
import AddMemberModal from '../components/AddMemberModal';
import {
  BoardCard,
  BoardStats,
  resolveBoardColor,
  toColorLookup,
  useAddBoardMembers,
  useBoards,
  useCreateBoard,
  useDashboardStats,
  useBoardMenu,
  useDeleteBoard,
} from '@/features/boards';
import { useColors } from '@/features/colors';
import type { Board, User } from '@/models';
import PageHeader from '../components/PageHeader';
import UserAvatar from '../components/UserAvatar';

const BoardDashboard: React.FC = () => {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [selectedBoardForMembers, setSelectedBoardForMembers] = useState<Board | null>(null);

  const menu = useBoardMenu();
  // Only failures the page causes itself. A failed read is reported by the
  // query below rather than kept in a second piece of state that has to be
  // cleared by hand.
  const [writeError, setWriteError] = useState<string | null>(null);

  const boardsQuery = useBoards();
  const statsQuery = useDashboardStats();

  // Memoised because the empty fallback would otherwise be a new array on
  // every render, and the colour resolving effect below depends on it: a
  // fresh identity each time makes that effect run forever.
  const boards = useMemo(() => boardsQuery.data ?? [], [boardsQuery.data]);
  const isLoading = boardsQuery.isPending || statsQuery.isPending;
  const error = writeError ?? (boardsQuery.isError || statsQuery.isError ? 'Failed to load data. Please try again later.' : null);

  const stats = statsQuery.data ?? {
    totalBoards: 0,
    totalMembers: 0,
    totalTasks: 0,
    avgProgress: 0,
  };

  const createBoard = useCreateBoard();
  const deleteBoard = useDeleteBoard();
  const addBoardMembers = useAddBoardMembers();

  // The whole board palette in one request, rather than resolving each
  // board's colour with a request of its own. The colours a board can carry
  // are a fixed seeded list, so a dashboard of twelve boards was making up to
  // twelve calls to fetch parts of a list it could have had in one.
  const { data: palette } = useColors('board');
  const colorLookup = useMemo(() => toColorLookup(palette ?? []), [palette]);

  // There is no refreshData any more. Every write below invalidates the two
  // keys it affects and the cache refetches them, which is the same thing
  // said once in features/boards/queries.ts instead of at four call sites,
  // and is also what runs when the window regains focus.

  const handleCreateBoard = async (newBoard: Pick<Board, 'title' | 'description' | 'color' | 'template'>) => {
    try {
      await createBoard.mutateAsync(newBoard);
      setWriteError(null);
      setShowCreateModal(false);
    } catch (err) {
      console.error('Error creating board:', err);
      setWriteError('Failed to create board. Please try again.');
    }
  };

  const handleDeleteBoard = async (boardId: string) => {
    const ok = window.confirm('Are you sure you want to delete this board? This action cannot be undone.');
    if (!ok) return;
    try {
      await deleteBoard.mutateAsync(boardId);
      setWriteError(null);
    } catch (err) {
      console.error('Error deleting board:', err);
      setWriteError('Failed to delete board. Please try again.');
    }
  };

  const handleOpenAddMember = (boardId: string) => {
    const board = boards.find(b => b._id === boardId) ?? null;
    setSelectedBoardForMembers(board);
    setShowAddMemberModal(true);
    menu.close();
  };

  const handleAddMembers = async (members: User[]) => {
    if (!selectedBoardForMembers) return;

    const boardId = selectedBoardForMembers._id;
    const memberIds = members.map(m => m._id);

    try {
      await addBoardMembers.mutateAsync({ boardId, memberIds });
      setWriteError(null);
    } catch (error) {
      console.error('Error adding members:', error);
      setWriteError('Failed to add members. Please try again.');
    } finally {
      setShowAddMemberModal(false);
      setSelectedBoardForMembers(null);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto mb-4" />
          <p className="text-gray-600">Loading boards...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="bg-red-100 text-red-700 p-4 rounded-lg mb-4">{error}</div>
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
      {/* Header */}
      <PageHeader title="My Boards" subtitle="Manage and organize your project boards">
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-all duration-200 shadow-lg hover:shadow-xl cursor-pointer"
        >
          <Plus size={20} />
          Create Board
        </button>
        <UserAvatar />
      </PageHeader>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-7xl mx-auto p-8">
        <BoardStats stats={stats} />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {boards.map((board, index) => (
            // `_id` is required on the model and the API always sends it. The
            // fallback this replaced ended in `temp-${Date.now()}`, which gave
            // every render a different React key and defeated reconciliation
            // for the whole grid. Finding P2-8.
            <BoardCard
              key={board._id}
              board={board}
              color={resolveBoardColor(board.color, colorLookup)}
              delay={index * 0.08}
              menuOpen={menu.isOpen(board._id)}
              isDeleting={deleteBoard.isPending && deleteBoard.variables === board._id}
              onToggleMenu={() => menu.toggle(board._id)}
              onAddMember={() => handleOpenAddMember(board._id)}
              onDelete={() => handleDeleteBoard(board._id)}
            />
          ))}
        </div>

        {/* Empty */}
        {boards.length === 0 && !isLoading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Folder className="text-gray-400" size={24} />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No boards yet</h3>
            <p className="text-gray-600 mb-6">Create your first board to get started with project management</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors cursor-pointer shadow-lg hover:shadow-xl"
            >
              Create Your First Board
            </button>
          </motion.div>
        )}
      </motion.div>

      {/* Modals */}
      <CreateBoardModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreateBoard={handleCreateBoard}
      />

      <AddMemberModal
        open={showAddMemberModal}
        onClose={() => {
          setShowAddMemberModal(false);
          setSelectedBoardForMembers(null);
        }}
        onAddMembers={handleAddMembers}
        boardTitle={selectedBoardForMembers?.title ?? ''}
        boardId={selectedBoardForMembers?._id ?? ''}
      />
    </div>
  );
};

export default BoardDashboard;
