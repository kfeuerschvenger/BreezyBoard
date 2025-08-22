import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Plus, Users, Calendar, MoreHorizontal, Folder, Trash2 } from 'lucide-react';
import * as Icons from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import CreateBoardModal from './CreateBoardModal';
import AddMemberModal from './AddMemberModal';
import { BoardService, DashboardService } from '@/services';
import { resolveColorValue, resolveColorValueSync } from '@/utils/colorUtils';
import type { Board, User } from '@/models';
import PageHeader from './PageHeader';
import UserAvatar from './UserAvatar';

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
  const navigate = useNavigate();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [selectedBoardForMembers, setSelectedBoardForMembers] = useState<Board | null>(null);

  const [boards, setBoards] = useState<Board[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [stats, setStats] = useState({
    totalBoards: 0,
    totalMembers: 0,
    totalTasks: 0,
    avgProgress: 0,
  });

  // map boardId -> colorHex
  const [boardColors, setBoardColors] = useState<Record<string, string>>({});

  const loadData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Obtener datos en paralelo
      const [boardsData, statsData] = await Promise.all([BoardService.getAll(), DashboardService.getStats()]);

      setBoards(boardsData || []);
      setStats(statsData);
    } catch (err) {
      console.error('Error loading data:', err);
      setError('Failed to load data. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

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

  // Actualizar datos después de operaciones
  const refreshData = async () => {
    const [boardsData, statsData] = await Promise.all([BoardService.getAll(), DashboardService.getStats()]);
    setBoards(boardsData || []);
    setStats(statsData);
  };

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

  const handleBoardClick = (boardId: string) => navigate(`/board/${boardId}`);

  const handleCreateBoard = async (
    newBoard: Omit<Board, 'id' | 'taskCount' | 'memberCount' | 'lastUpdated' | 'progress'>
  ) => {
    try {
      await BoardService.create(newBoard);
      await refreshData();
      setShowCreateModal(false);
    } catch (err) {
      console.error('Error creating board:', err);
      setError('Failed to create board. Please try again.');
    }
  };

  const handleToggleMenu = (e: React.MouseEvent, boardId: string) => {
    e.stopPropagation();
    setOpenMenuId(prev => (prev === boardId ? null : boardId));
  };

  const handleDeleteBoard = async (e: React.MouseEvent, boardId: string) => {
    e.stopPropagation();
    const ok = window.confirm('Are you sure you want to delete this board? This action cannot be undone.');
    if (!ok) return;
    try {
      await BoardService.delete(boardId);
      await refreshData();
    } catch (err) {
      console.error('Error deleting board:', err);
      setError('Failed to delete board. Please try again.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleOpenAddMember = (boardId: string, e: React.MouseEvent) => {
    e.stopPropagation();
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
      await BoardService.addMembers(boardId, memberIds);
      await refreshData();
    } catch (error) {
      console.error('Error adding members:', error);
      setError('Failed to add members. Please try again.');
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
            const id = (board as any)._id ?? (board as any).id ?? `temp-${Date.now()}-${index}`;
            const templateObj = (board as any).template;
            const iconName = (templateObj && (templateObj.iconName ?? templateObj.icon)) || null;
            const IconFromTemplate = (iconName && (Icons as any)[iconName]) || Icons.Folder;
            const colorHex = boardColors[id] ?? resolveColorValueSync((board as any).color, '#64748B');

            const safeBoard = {
              id,
              title: board.title || 'Untitled Board',
              description: board.description || 'No description',
              color: colorHex,
              progress: calculateProgress(board),
              taskCount: typeof board.taskCount === 'number' ? board.taskCount : 0,
              memberCount: typeof board.memberCount === 'number' ? board.memberCount : 0,
              lastUpdated: board.lastUpdated || board.updatedAt || new Date().toISOString(),
            };

            const isMenuOpen = openMenuId === id;
            const isDeleting = deletingId === id;

            return (
              <motion.div
                key={safeBoard.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.08 }}
                onClick={() => handleBoardClick(safeBoard.id)}
                className="bg-white rounded-xl shadow-sm border border-gray-100 hover:shadow-lg transition-all duration-300 cursor-pointer group overflow-visible relative"
                aria-label={`Board: ${safeBoard.title}`}
                role="button"
                tabIndex={0}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') handleBoardClick(safeBoard.id);
                }}
              >
                {/* Header */}
                <div className="p-6 border-b border-gray-100">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      {/* Icon colored with the board color */}
                      <div className="flex items-center justify-center p-1 rounded" onClick={e => e.stopPropagation()}>
                        <IconFromTemplate size={22} style={{ color: safeBoard.color }} aria-hidden="true" />
                      </div>
                      <h3 className="font-semibold text-gray-900 font-heading group-hover:text-blue-600 transition-colors">
                        {safeBoard.title}
                      </h3>
                    </div>

                    {/* Options + Add member */}
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <button
                          data-board-menu-btn
                          onClick={e => handleToggleMenu(e, id)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-gray-100 rounded"
                          aria-label="Board options"
                        >
                          <MoreHorizontal size={16} className="text-gray-400" />
                        </button>

                        {isMenuOpen && (
                          <div
                            data-board-menu
                            onClick={e => e.stopPropagation()}
                            className="absolute right-0 mt-2 w-44 bg-white border border-gray-200 rounded-lg shadow-lg z-50"
                          >
                            <button
                              onClick={e => handleOpenAddMember(id, e)}
                              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2 cursor-pointer"
                            >
                              <Users size={14} />
                              Add Member
                            </button>

                            <button
                              onClick={e => handleDeleteBoard(e, id)}
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
