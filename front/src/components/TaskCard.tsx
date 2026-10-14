import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { IconAlignLeft, IconCircleCheckFilled,IconGripVertical, IconListCheck } from '@tabler/icons-react';
import { swayAnimation, swayOf, useBreeze } from '@/features/breeze';
import { Avatar, Chip, Icon } from '@/shared/ui';
import type { Task } from '@/models';
import { COLOR_FALLBACK } from '@/features/colors';
import { asTaskPriority, PRIORITY_HUE, PRIORITY_LABELS, TaskMoveMenu } from '@/features/tasks';
import type { MoveTarget } from '@/features/tasks';

/** How a card announces itself on arrival: dropped into place, or newly created. */
export type CardEntrance = 'landed' | 'fresh';

interface TaskCardViewProps {
  task: Task;
  /**
   * The hex value of the task's colour, already resolved. Whoever renders the
   * board reads the palette once and passes the answer, so no card asks the
   * colour endpoint for itself.
   */
  color?: string;
  /** The card sits in the board's last column, so it is drawn as landed. */
  done?: boolean;
  onClick?: () => void;
  /**
   * The columns the card can be moved to without dragging. The "Move to" menu
   * renders only when this and `onMove` are both given, so the copy of the card
   * in the drag overlay never carries one.
   */
  moveTargets?: MoveTarget[];
  onMove?: (task: Task, target: MoveTarget) => void;
  /** The card is in the air, so its place in the column is the gap and the card takes no room. */
  held?: boolean;
  entrance?: CardEntrance | null;
  /** Called when the entrance animation has finished, so the caller can clear its flag. */
  onEntranceEnd?: (taskId: string) => void;
  /** The copy that follows the pointer: lifted, tilted, and not a control. */
  overlay?: boolean;
  /** The card has been deleted and is playing its exit: not a control, and not part of the board any more. */
  leaving?: boolean;
  /** Set by the sortable wrapper: the node the drag context measures and the activator props of the handle. */
  rootRef?: (node: HTMLElement | null) => void;
  handleProps?: React.ButtonHTMLAttributes<HTMLButtonElement>;
}

const CARD_CLASSES = 'rounded-card bg-surface transition-[translate,rotate,box-shadow] duration-250 ease-standard';

/**
 * The card while a drag has it in the air. Its place in the column is the gap,
 * so the card collapses to nothing rather than being removed: the element has
 * to stay mounted and focusable, because the keyboard sensor is listening on
 * it and focus has to still be on its handle when the card is put down.
 *
 * It carries no padding of its own. A box cannot be shorter than its padding,
 * so a `p-0` beside a `py-3` would lose to it and leave the card 24 pixels
 * tall; the padding belongs to the states in which the card has a body.
 */
const HELD_CLASSES = 'pointer-events-none mb-0 h-0 overflow-hidden opacity-0';

const BODY_CLASSES = 'px-3.5 py-3 shadow-card';

/** The card's resting rules, which a card in the air or in the overlay does not have. */
const RESTING_CLASSES = `${BODY_CLASSES} mb-2.5 cursor-pointer hover:-translate-y-0.5 hover:-rotate-[0.6deg] hover:shadow-card-hover`;

const OVERLAY_CLASSES = 'px-3.5 py-3 rotate-3 scale-[1.03] cursor-grabbing shadow-card-landing';

/**
 * The card as it is blown away: it keeps its size and its place in the column
 * while `animate-bb-away` carries it off, so the cards around it stay where
 * they are until it is gone and then close the gap. It takes no pointer, so a
 * press on the spot it still occupies reaches what is under it.
 */
const LEAVING_CLASSES = `${BODY_CLASSES} mb-2.5 pointer-events-none animate-bb-away`;

const ENTRANCE_CLASSES: Record<CardEntrance, string> = {
  landed: 'animate-bb-land',
  fresh: 'animate-bb-in',
};

/**
 * The card as drawn, with no knowledge of dnd-kit: the sortable wrapper below
 * supplies the node and the handle's activators, and the drag overlay supplies
 * neither.
 *
 * The card is a container, not a control. Its title is a real button, so the
 * keyboard can open the task, and a click anywhere else on the card opens it
 * for a mouse. The drag handle and the "Move to" button sit in their own box
 * and swallow their clicks, so neither opens the task.
 */
const TaskCardView: React.FC<TaskCardViewProps> = ({
  task,
  color = COLOR_FALLBACK,
  done = false,
  onClick,
  moveTargets,
  onMove,
  held = false,
  entrance = null,
  onEntranceEnd,
  overlay = false,
  leaving = false,
  rootRef,
  handleProps,
}) => {
  const { level } = useBreeze();

  // The overlay and the card on its way out are both pictures of a card: they
  // draw its content and carry no control and no way in.
  const picture = overlay || leaving;

  const checklist = task.checklist ?? [];
  const completedItems = checklist.filter(item => item.completed).length;
  const totalItems = checklist.length;

  // Anything unrecognised reads as the least urgent rather than crashing.
  const priority = asTaskPriority(task.priority);

  const hasDescription = Boolean(task.description?.trim());

  const owner = typeof task.owner === 'object' && task.owner ? task.owner : null;
  const ownerName = owner ? `${owner.firstName ?? ''} ${owner.lastName ?? ''}`.trim() : '';

  // One animation property serves four purposes and only one can win. A card
  // that has just arrived or landed plays that; otherwise, in gusty weather, it
  // sways. A card in the air or in the overlay plays neither.
  const style = useMemo(
    () =>
      !held && !picture && !entrance && level === 'gusty'
        ? { animation: swayAnimation(swayOf(task._id)) }
        : undefined,
    [held, picture, entrance, level, task._id],
  );

  const stopClick = useCallback((event: React.MouseEvent) => event.stopPropagation(), []);

  // The card's own animation ends the entrance, and one inside it must not.
  // A native listener rather than `onAnimationEnd`, as `useShake` does: the
  // event bubbles, so the target is checked, and a listener on the node sees
  // the same event in a test as in a browser.
  const node = useRef<HTMLElement | null>(null);
  const attach = useCallback(
    (element: HTMLElement | null) => {
      node.current = element;
      rootRef?.(element);
    },
    [rootRef],
  );
  useEffect(() => {
    const element = node.current;
    if (!entrance || !element) return;

    const done = (event: Event) => {
      if (event.target === element) onEntranceEnd?.(task._id);
    };
    element.addEventListener('animationend', done);
    return () => element.removeEventListener('animationend', done);
  }, [entrance, onEntranceEnd, task._id]);

  const state = held ? HELD_CLASSES : overlay ? OVERLAY_CLASSES : leaving ? LEAVING_CLASSES : RESTING_CLASSES;
  const arrival = !held && !picture && entrance ? ENTRANCE_CLASSES[entrance] : '';

  return (
    // The mouse opens the task from anywhere on the card. The keyboard does it
    // through the title button inside, which is the focusable control, so this
    // handler is a pointer affordance and not a second way in.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events
    <div
      ref={attach}
      style={style}
      // A card on its way out is not on the board, so it is not found as one:
      // `data-task-card` is how the board's own code and its checks find a card.
      data-task-card={leaving ? undefined : task._id}
      data-task-leaving={leaving ? task._id : undefined}
      data-landed={entrance === 'landed' && !held ? '' : undefined}
      role="article"
      aria-labelledby={`task-title-${task._id}`}
      aria-hidden={picture || undefined}
      inert={leaving || undefined}
      onClick={picture || !onClick ? undefined : () => onClick()}
      className={`${CARD_CLASSES} ${state} ${arrival} flex flex-col gap-[9px]`}
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          data-task-colour
          className="size-2 shrink-0 rotate-12 rounded-[3px]"
          style={{ backgroundColor: color }}
        />
        <Chip hue={PRIORITY_HUE[priority]}>
          <span className="sr-only">Priority: </span>
          {PRIORITY_LABELS[priority]}
        </Chip>
      </div>

      <div className="flex items-start gap-2">
        {done && (
          <Icon as={IconCircleCheckFilled} size={17} className="mt-px shrink-0 text-success" aria-hidden="true" />
        )}

        <h3 id={`task-title-${task._id}`} className="min-w-0 flex-1 font-heading text-[14.5px] font-semibold leading-snug">
          {picture ? (
            <span className={`break-words ${done ? 'text-ink-secondary' : 'text-ink'}`}>{task.title}</span>
          ) : (
            <button
              type="button"
              data-task-open={task._id}
              className={`focus-ring -m-0.5 cursor-pointer break-words rounded p-0.5 text-left ${
                done ? 'text-ink-secondary' : 'text-ink'
              }`}
            >
              {task.title}
            </button>
          )}
        </h3>

        {/* A box of their own that swallows clicks, so neither control opens the task. */}
        {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
        <div className="flex shrink-0 items-center gap-1" onClick={stopClick}>
          {!picture && moveTargets && onMove && (
            <TaskMoveMenu
              taskId={task._id}
              taskTitle={task.title}
              columns={moveTargets}
              currentColumnId={task.status}
              onMove={target => onMove(task, target)}
            />
          )}

          {/*
            A real button rather than a div carrying a role. As a div it relied
            on dnd-kit to supply the role, the tab stop and the key handling,
            none of which static analysis can see through a spread, so it sat
            under two permanent accessibility warnings that could not be
            answered without rewriting it. A button needs none of them to be
            reachable, and dnd-kit's own attributes sit on top unchanged.

            The dnd-kit spread MUST still come last: it supplies onPointerDown
            and onKeyDown, which are the sensor activators, and a duplicate JSX
            prop declared after a spread silently replaces them. That is
            finding P0-3. aria-label survives because dnd-kit does not set it.
          */}
          {picture ? (
            <span className="flex size-6 items-center justify-center text-ink-tertiary" aria-hidden="true">
              <Icon as={IconGripVertical} size={16} />
            </span>
          ) : (
            <button
              type="button"
              className="focus-ring flex size-6 cursor-grab items-center justify-center rounded text-ink-tertiary hover:text-ink"
              aria-label="Drag handle"
              data-task-drag-handle={task._id}
              {...handleProps}
            >
              <Icon as={IconGripVertical} size={16} />
            </button>
          )}
        </div>
      </div>

      {(totalItems > 0 || owner || hasDescription) && (
        <div className="flex items-center gap-3 text-xs">
          {/* The text is not printed, only the fact that there is some. The words are read inside the card, not in its name. */}
          {hasDescription && (
            <span data-task-description className="flex items-center text-ink-secondary">
              <Icon as={IconAlignLeft} size={14} aria-hidden="true" />
              <span className="sr-only">Has a description</span>
            </span>
          )}

          {totalItems > 0 && (
            <span
              data-checklist-progress
              className={`flex items-center gap-1 font-mono ${
                completedItems === totalItems ? 'text-green-deep' : 'text-ink-secondary'
              }`}
            >
              <Icon as={IconListCheck} size={13} aria-hidden="true" />
              <span>
                {completedItems}/{totalItems}
              </span>
              <span className="sr-only"> checklist items completed</span>
            </span>
          )}

          {owner && (
            <span className="ml-auto flex" title={ownerName}>
              <Avatar name={ownerName} src={owner.avatar} seed={owner._id} size="sm" ring="surface" decorative />
              <span className="sr-only">Owner: {ownerName}</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export type TaskCardProps = Omit<TaskCardViewProps, 'rootRef' | 'handleProps' | 'overlay' | 'leaving'>;

/**
 * A task on the board, draggable by its handle.
 *
 * It is both a draggable and a droppable, because dnd-kit reports a card as
 * the thing a card is over. Its column's sorting strategy moves nothing: the
 * gap that opens in a column is a real element the column draws, so a
 * transform from the sortable layer on top of it would shift every card twice.
 */
const TaskCard: React.FC<TaskCardProps> = props => {
  const { attributes, listeners, setNodeRef } = useSortable({ id: props.task._id });

  return <TaskCardView {...props} rootRef={setNodeRef} handleProps={{ ...attributes, ...listeners }} />;
};

/** The copy of a card that follows the pointer. It carries no handlers and no controls. */
export const TaskCardOverlay: React.FC<Pick<TaskCardViewProps, 'task' | 'color' | 'done'>> = props => (
  <TaskCardView {...props} overlay />
);

/**
 * How long a leaving card is given, counted from the moment its animation
 * starts, before it is taken off the board whether or not the animation
 * reported an end. The animation is 460 milliseconds, and reduced motion
 * collapses it to an instant that still reports one. The rest is slack for a
 * frame that runs long, so that a busy page does not cut the exit short.
 */
export const LEAVING_FALLBACK_MS = 800;

/**
 * How long a leaving card waits for its animation to start at all. The
 * animation's clock starts at the first frame the browser paints after the
 * picture mounts, which on a busy page is several hundred milliseconds later,
 * so this is far longer than the animation. It is for a browser that never
 * runs it, such as a tab in the background, which would otherwise keep the
 * picture on the board for good.
 */
export const LEAVING_START_GUARD_MS = 3000;

export interface TaskCardLeavingProps extends Pick<TaskCardViewProps, 'task' | 'color' | 'done'> {
  /** The card has finished leaving, and nothing of it needs to stay on the board. */
  onGone: (taskId: string) => void;
}

/**
 * A deleted card playing its exit, which is the reference design's `bbAway`:
 * it lifts off to the upper right, turns and fades over 460 milliseconds. It is
 * a picture of the card and nothing more, with no drag, no menu and no way in,
 * so dnd-kit never sees it and the cards around it are not rearranged by it
 * until it is gone.
 *
 * The exit is interaction motion: it plays at every Breeze level, and only the
 * system's reduced motion preference collapses it.
 */
export const TaskCardLeaving: React.FC<TaskCardLeavingProps> = ({ task, color, done, onGone }) => {
  const [node, setNode] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!node) return;

    const finish = () => onGone(task._id);
    // Its own animation ends the exit, and one inside it must not.
    const onEnd = (event: Event) => {
      if (event.target === node) finish();
    };
    // The backstop is re-armed when the animation really starts, so a late
    // first frame does not eat into the 460 milliseconds it is there to protect.
    let fallback = window.setTimeout(finish, LEAVING_START_GUARD_MS);
    const onStart = (event: Event) => {
      if (event.target !== node) return;
      window.clearTimeout(fallback);
      fallback = window.setTimeout(finish, LEAVING_FALLBACK_MS);
    };
    node.addEventListener('animationstart', onStart);
    node.addEventListener('animationend', onEnd);

    return () => {
      node.removeEventListener('animationstart', onStart);
      node.removeEventListener('animationend', onEnd);
      window.clearTimeout(fallback);
    };
  }, [node, task._id, onGone]);

  return <TaskCardView task={task} color={color} done={done} leaving rootRef={setNode} />;
};

// memoize to avoid unnecessary re-renders when props are shallow-equal
export default React.memo(TaskCard);
