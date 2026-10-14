import React, { useId } from 'react';
import { IconArrowsLeftRight } from '@tabler/icons-react';
import { Icon } from '@/shared/ui';
import type { MoveTarget } from '../hooks/useTaskMover';

export interface TaskMoveToPickerProps {
  /** Every column of the board, in board order. */
  columns: MoveTarget[];
  /** The column the task is in now, which is the one pressed. */
  currentColumnId: string;
  onMove: (target: MoveTarget) => void;
}

// Whole class names, never composed at runtime: Tailwind reads the source for
// complete ones. The pressed button is filled with ink and its text is white,
// which is 17.3:1 and does not depend on colour at all. The others carry the
// control border, 3.34:1 on white, because a button is found by its boundary.
const BASE_CLASSES =
  'focus-ring inline-flex h-11 max-w-full cursor-pointer items-center rounded-button-small px-3.5 text-[13px] font-semibold ' +
  'transition-[background-color,border-color,color] duration-200 md:h-[34px]';
const PRESSED_CLASSES = 'bg-ink text-white';
const IDLE_CLASSES =
  'border-[1.5px] border-line-control bg-surface text-ink-secondary hover:border-ink-secondary hover:text-ink';

/**
 * The columns of the board as a row of buttons, the one the task is in pressed.
 *
 * It is the other way to move a task without dragging it, beside the menu on
 * the card, and it moves at once: choosing a column is the whole action, with
 * no save to press after it. The pressed state is a `aria-pressed`, so a
 * screen reader says which column the task is in as it reads the row.
 *
 * Pressing the column the task is already in does nothing and says nothing.
 */
export const TaskMoveToPicker: React.FC<TaskMoveToPickerProps> = ({ columns, currentColumnId, onMove }) => {
  const labelId = useId();

  return (
    <div role="group" aria-labelledby={labelId}>
      <p id={labelId} className="mb-2 block text-[13px] font-semibold text-ink-secondary">
        <Icon as={IconArrowsLeftRight} size={16} className="mr-1 inline" aria-hidden="true" />
        Move to
      </p>
      <div className="flex flex-wrap gap-2">
        {columns.map(column => {
          const pressed = column.id === currentColumnId;

          return (
            <button
              key={column.id}
              type="button"
              aria-pressed={pressed}
              onClick={() => {
                if (!pressed) onMove(column);
              }}
              className={`${BASE_CLASSES} ${pressed ? PRESSED_CLASSES : IDLE_CLASSES}`}
            >
              <span className="truncate">{column.title}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default TaskMoveToPicker;
