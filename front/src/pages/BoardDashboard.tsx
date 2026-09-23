import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Users, Calendar, MoreHorizontal, Folder, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import CreateBoardModal from '../components/CreateBoardModal';
import AddMemberModal from '../components/AddMemberModal';
import {
  useAddBoardMembers,
  useBoards,
  useCreateBoard,
  useDashboardStats,
  useDeleteBoard,
} from '@/features/boards/queries';
import { resolveColorValue, resolveColorValueSync } from '@/utils/colorUtils';
import type { Board, User } from '@/models';
import { resolveIcon } from '@/shared/lib/lucideIcons';
import PageHeader from '../components/PageHeader';
import UserAvatar from '../components/UserAvatar';

const safeFormatDate = (dateString?: string) => {
  if (!dateString) return 'N/A';
  try {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return 'Invalid date';
  }
};

const BoardDashboard: React.FC = () => {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [selectedBoardForMembers, setSelectedBoardForMembers] = useState<Board | null>(null);

  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
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

  // map boardId -> colorHex
  const [boardColors, setBoardColors] = useState<Record<string, string>>({});

  // Pre-resolve colors for all boards when boards change
  useEffect(() => {
    let mounted = true;

    if (!boards || boards.length === 0) {
      setBoardColors({});
      return;
    }
    (async () => {
      try {
        const entries = await Promise.all(
          boards.map(async b => {
            const id = b._id;
            // quick sync value (may be actual hex)
            const sync = resolveColorValueSync(b.color, '#64748B');
            if (sync && sync !== '#64748B') {
              return [id, sync] as [string, string];
            }
            // otherwise try async resolution (id or object)
            try {
              const hex = await resolveColorValue(b.color, '#64748B');
              return [id, hex] as [string, string];
            } catch {
              return [id, '#64748B'] as [string, string];
            }
          })
        );
        if (!mounted) return;

        const map: Record<string, string> = {};
        entries.forEach(([id, hex]) => {
          if (id) map[id] = hex;
        });
        setBoardColors(prev => ({ ...prev, ...map }));
      } catch {
        // console.warn('Failed to preload board colors');
      }
    })();

    return () => {
      mounted = false;
    };
  }, [boards]);

  // There is no refreshData any more. Every write below invalidates the two
  // keys it affects and the cache refetches them, which is the same thing
  // said once in features/boards/queries.ts instead of at four call sites,
  // and is also what runs when the window regains focus.

  // close menu on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenMenuId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // close menu on outside click
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const tgt = e.target as HTMLElement | null;
      if (!tgt) return;
      if (tgt.closest('[data-board-menu]') || tgt.closest('[data-board-menu-btn]')) return;
      setOpenMenuId(null);
    };
    window.addEventListener('click', onClick);
    return () => window.removeEventListener('click', onClick);
  }, []);

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

  // None of these stop propagation any more. They used to, because the whole
  // card was a click handler that would navigate away underneath them; the
  // card is a container now and the navigation lives in a link, so there is
  // nothing left to stop.
  const handleToggleMenu = (boardId: string) => {
    setOpenMenuId(prev => (prev === boardId ? null : boardId));
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
    } finally {
      setDeletingId(null);
    }
  };

  const handleOpenAddMember = (boardId: string) => {
    const board = boards.find(b => b._id === boardId) ?? null;
    setSelectedBoardForMembers(board);
    setShowAddMemberModal(true);
    setOpenMenuId(null);
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

  const calculateProgress = (board: Board) => {
    try {
      if (typeof board.progress === 'number') return board.progress;
      if (typeof board.progress === 'object' && Object.keys(board.progress).length === 0) return 0;
      return 0;
    } catch {
      return 0;
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
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white p-6 rounded-xl shadow-sm border border-gray-100"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Folder className="text-blue-600" size={20} />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.totalBoards}</p>
                <p className="text-sm text-gray-600">Total Boards</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white p-6 rounded-xl shadow-sm border border-gray-100"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <Users className="text-green-600" size={20} />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.totalMembers}</p>
                <p className="text-sm text-gray-600">Team Members</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white p-6 rounded-xl shadow-sm border border-gray-100"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 rounded-lg">
                <Calendar className="text-orange-600" size={20} />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.totalTasks}</p>
                <p className="text-sm text-gray-600">Total Tasks</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-white p-6 rounded-xl shadow-sm border border-gray-100"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <div className="w-5 h-5 bg-purple-600 rounded-full flex items-center justify-center">
                  <div className="w-2 h-2 bg-white rounded-full" />
                </div>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.avgProgress}%</p>
                <p className="text-sm text-gray-600">Avg Progress</p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Boards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {boards.map((board, index) => {
            // `_id` is required on the model and the API always sends it.
            // The fallback this replaced ended in `temp-${Date.now()}`,
            // which produced a different React key on every render and
            // defeated reconciliation for the whole grid. Finding P2-8.
            const id = board._id;
            const template = typeof board.template === 'object' ? board.template : null;
            const IconFromTemplate = resolveIcon(template?.iconName);
            const colorHex = boardColors[id] ?? resolveColorValueSync(board.color, '#64748B');

            const safeBoard = {
              id,
              title: board.title || 'Untitled Board',
              description: board.description || 'No description',
              color: colorHex,
              progress: calculateProgress(board),
              taskCount: typeof board.taskCount === 'number' ? board.taskCount : 0,
              memberCount: typeof board.memberCount === 'number' ? board.memberCount : 0,
              lastUpdated: board.updatedAt || new Date().toISOString(),
            };

            const isMenuOpen = openMenuId === id;
            const isDeleting = deletingId === id;

            return (
              <motion.div
                key={safeBoard.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.08 }}
                // Not a button any more. It used to be role="button" with a
                // tabIndex and a key handler, wrapping the options button and
                // the menu inside it, which is interactive content nested in
                // an interactive element: invalid, and it is what put the two
                // stopPropagation handlers below in the markup that the
                // accessibility lint was reporting.
                //
                // The card is now a plain container and the board title is a
                // real link whose hit area is stretched over the whole card
                // by a pseudo element. A mouse keeps the large target, the
                // keyboard gets one link per card instead of a button holding
                // buttons, and nothing needs to stop a parent handler from
                // firing because there is no parent handler.
                className="bg-white rounded-xl shadow-sm border border-gray-100 hover:shadow-lg transition-all duration-300 group overflow-visible relative"
              >
                {/* Header */}
                <div className="p-6 border-b border-gray-100">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      {/* Icon colored with the board color */}
                      <div className="flex items-center justify-center p-1 rounded">
                        <IconFromTemplate size={22} style={{ color: safeBoard.color }} aria-hidden="true" />
                      </div>
                      <h3 className="font-semibold text-gray-900 font-heading group-hover:text-blue-600 transition-colors">
                        {/* after:absolute after:inset-0 is what stretches this
                            link over the card. Everything else that is
                            clickable sits above it on z-10. */}
                        <Link
                          to={`/board/${safeBoard.id}`}
                          className="after:absolute after:inset-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                        >
                          {safeBoard.title}
                        </Link>
                      </h3>
                    </div>

                    {/* Options + Add member */}
                    <div className="flex items-center gap-2">
                      <div className="relative z-10">
                        <button
                          data-board-menu-btn
                          onClick={() => handleToggleMenu(id)}
                          className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity p-1 hover:bg-gray-100 rounded"
                          aria-label={`Options for ${safeBoard.title}`}
                        >
                          <MoreHorizontal size={16} className="text-gray-400" />
                        </button>

                        {isMenuOpen && (
                          <div
                            data-board-menu
                            className="absolute right-0 mt-2 w-44 bg-white border border-gray-200 rounded-lg shadow-lg z-50"
                          >
                            <button
                              onClick={() => handleOpenAddMember(id)}
                              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2 cursor-pointer"
                            >
                              <Users size={14} />
                              Add Member
                            </button>

                            <button
                              onClick={() => handleDeleteBoard(id)}
                              disabled={isDeleting}
                              className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 cursor-pointer"
                            >
                              <Trash2 size={14} className="text-red-600" />
                              <span className="text-red-600">{isDeleting ? 'Deleting...' : 'Delete'}</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <p className="text-sm text-gray-600 font-body mb-4 min-h-[3rem]">{safeBoard.description}</p>

                  {/* Progress */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-gray-500">Progress</span>
                      <span className="text-xs text-gray-700 font-medium">{safeBoard.progress}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="h-2 rounded-full transition-all duration-300"
                        style={{
                          backgroundColor: safeBoard.color,
                          width: `${Math.min(100, Math.max(0, safeBoard.progress))}%`,
                        }}
                        aria-valuenow={safeBoard.progress}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        role="progressbar"
                      />
                    </div>
                  </div>
                </div>

                {/* Stats */}
                <div className="p-6">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1 text-gray-600">
                        <div className="w-3 h-3 bg-gray-300 rounded" aria-hidden="true" />
                        <span>{safeBoard.taskCount} tasks</span>
                      </div>
                      <div className="flex items-center gap-1 text-gray-600">
                        <Users size={12} aria-hidden="true" />
                        <span>{safeBoard.memberCount}</span>
                      </div>
                    </div>
                    <div className="text-gray-500">
                      <span>Updated {safeFormatDate(safeBoard.lastUpdated)}</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
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
