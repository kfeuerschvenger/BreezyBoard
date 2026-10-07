import React from 'react';
import { ArrowRightLeft } from 'lucide-react';
import { Menu, MenuItem } from '@/shared/ui';
import type { MoveTarget } from '../hooks/useTaskMover';

export interface TaskMoveMenuProps {
  /** Names the trigger, so one card's menu is distinguishable from another's. */
  taskId: string;
  taskTitle: string;
  /** Every column of the board, in board order. */
  columns: MoveTarget[];
  currentColumnId: string;
  onMove: (target: MoveTarget) => void;
}

/**
 * The single-pointer alternative to dragging a card (WCAG 2.5.7): a menu of
 * the board's columns that moves the card without any pointer travel.
 *
 * The column the card is already in is listed but cannot be chosen, so the
 * menu reads as the whole board with a "you are here" marker rather than as a
 * list whose length changes from card to card.
 *
 * The trigger sits beside the drag handle and is a separate control. The
 * handle's pointer and key listeners are the sensor activators and stay on
 * it alone, so this button can neither start a drag nor be swallowed by one.
 *
 * `data-task-move-trigger` is the hook the board uses to give focus back to
 * the card after it has moved: a card that changes column is a new element,
 * and the one that had focus is gone.
 */
export const TaskMoveMenu: React.FC<TaskMoveMenuProps> = ({ taskId, taskTitle, columns, currentColumnId, onMove }) => (
  <Menu
    label={`Move ${taskTitle} to`}
    renderTrigger={(props, { open }) => (
      <button
        {...props}
        type="button"
        data-task-move-trigger={taskId}
        aria-label={`Move ${taskTitle} to another column`}
        className={`flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:h-8 sm:w-8 ${
          open ? 'bg-gray-100 text-gray-700' : ''
        }`}
      >
        <ArrowRightLeft size={16} aria-hidden="true" />
      </button>
    )}
  >
    {columns.map(column => {
      const isCurrent = column.id === currentColumnId;

      return (
        <MenuItem key={column.id} disabled={isCurrent} onSelect={() => onMove(column)}>
          <span className="flex-1 truncate">{column.title}</span>
          {isCurrent && <span className="text-xs text-gray-500">Current</span>}
        </MenuItem>
      );
    })}
  </Menu>
);

export default TaskMoveMenu;
