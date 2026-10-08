import React from 'react';
import { motion } from 'framer-motion';
import { IconUsers } from '@tabler/icons-react';
import { Icon } from '@/shared/ui';
import { Link } from 'react-router-dom';
import { resolveIcon } from '@/shared/lib/templateIcons';
import type { Board } from '@/models';
import { BoardCardMenu } from './BoardCardMenu';

export interface BoardCardProps {
  board: Board;
  /** The hex value the board is painted with, already resolved. */
  color: string;
  menuOpen: boolean;
  isDeleting: boolean;
  onToggleMenu: () => void;
  onAddMember: () => void;
  onDelete: () => void;
  /** Seconds to stagger the entrance by, within a grid. */
  delay?: number;
}

const formatUpdated = (dateString?: string) => {
  if (!dateString) return 'N/A';
  try {
    return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return 'Invalid date';
  }
};

/**
 * A board's progress as a whole percentage.
 *
 * The API sends a number. It has also sent an empty object, which is what the
 * guard is for and why this is not simply read off the board.
 */
const percentComplete = (board: Board): number => (typeof board.progress === 'number' ? board.progress : 0);

/**
 * One board in the dashboard grid.
 *
 * The card is a container rather than a control. It used to be a
 * `role="button"` with a tabIndex and a key handler, wrapping the options
 * button and its menu, which is interactive content nested inside an
 * interactive element: invalid, and the reason two stopPropagation handlers
 * existed here at all.
 *
 * The title is a real link whose hit area is stretched over the whole card by
 * a pseudo element, so a mouse keeps the large target and the keyboard gets
 * one link per card instead of a button holding buttons. Everything else that
 * can be clicked sits above that link on z-10.
 */
export const BoardCard: React.FC<BoardCardProps> = ({
  board,
  color,
  menuOpen,
  isDeleting,
  onToggleMenu,
  onAddMember,
  onDelete,
  delay = 0,
}) => {
  const template = typeof board.template === 'object' ? board.template : null;
  const TemplateIcon = resolveIcon(template?.iconName);

  const title = board.title || 'Untitled Board';
  const progress = percentComplete(board);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="bg-white rounded-xl shadow-sm border border-gray-100 hover:shadow-lg transition-all duration-300 group overflow-visible relative"
    >
      <div className="p-6 border-b border-gray-100">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center p-1 rounded">
              <Icon as={TemplateIcon} size={22} style={{ color }} aria-hidden="true" />
            </div>
            <h3 className="font-semibold text-gray-900 font-heading group-hover:text-blue-600 transition-colors">
              <Link
                to={`/board/${board._id}`}
                className="after:absolute after:inset-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
              >
                {title}
              </Link>
            </h3>
          </div>

          {/*
            Both actions in the menu are owner only on the server, so for
            anybody else the menu would hold nothing that can succeed and is
            not rendered at all. The role is the server's: a workspace admin
            arrives as an owner, and a board without a role is treated as
            not owned rather than guessed at.
          */}
          {board.viewerRole === 'owner' && (
            <div className="flex items-center gap-2">
              <BoardCardMenu
                boardTitle={title}
                open={menuOpen}
                isDeleting={isDeleting}
                onToggle={onToggleMenu}
                onAddMember={onAddMember}
                onDelete={onDelete}
              />
            </div>
          )}
        </div>

        <p className="text-sm text-gray-600 font-body mb-4 min-h-[3rem]">{board.description || 'No description'}</p>

        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500">Progress</span>
            <span className="text-xs text-gray-700 font-medium">{progress}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="h-2 rounded-full transition-all duration-300"
              style={{ backgroundColor: color, width: `${Math.min(100, Math.max(0, progress))}%` }}
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
              role="progressbar"
            />
          </div>
        </div>
      </div>

      <div className="p-6">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1 text-gray-600">
              <div className="w-3 h-3 bg-gray-300 rounded" aria-hidden="true" />
              <span>{typeof board.taskCount === 'number' ? board.taskCount : 0} tasks</span>
            </div>
            <div className="flex items-center gap-1 text-gray-600">
              <Icon as={IconUsers} size={12} aria-hidden="true" />
              <span>{typeof board.memberCount === 'number' ? board.memberCount : 0}</span>
            </div>
          </div>
          <div className="text-gray-500">
            <span>Updated {formatUpdated(board.updatedAt || new Date().toISOString())}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default BoardCard;
