import React from 'react';
import { IconPalette, IconWind } from '@tabler/icons-react';
import { Button, Field, Input, SwatchPicker, Textarea, Icon } from '@/shared/ui';
import { UserPicker } from '@/features/users';
import { Checklist } from './Checklist';
import { PrioritySelect } from './PrioritySelect';
import { TaskMoveToPicker } from './TaskMoveToPicker';
import type { UseTaskModalResult } from '../hooks/useTaskModal';
import type { MoveTarget } from '../hooks/useTaskMover';

/** The id the form carries, so buttons outside it can submit it. */
export const TASK_FORM_ID = 'task-form';

export interface TaskFormProps extends UseTaskModalResult {
  /** The board's columns and the one the task is in. Without them the form has no "Move to" row. */
  columns?: MoveTarget[];
  columnId?: string;
  onMove?: (target: MoveTarget) => void;
}

export interface TaskFormActionsProps {
  isValid: boolean;
  isSubmitting: boolean;
  /** "Blow it away" is offered only when the caller can delete. */
  onDelete?: () => void;
  isDeleting?: boolean;
}

/**
 * The modal's buttons: "Blow it away" on the left and one dark "Done" on the
 * right, which saves and closes.
 *
 * There is no Cancel. The close button and Escape leave the modal, and what was
 * typed stays as a draft until it is saved or the card is blown away.
 *
 * They are rendered by the modal's footer rather than inside the form, so a
 * long form scrolls underneath them instead of carrying them off screen. The
 * `form` attribute is what keeps the submit button the form's own: pressing it
 * and pressing Enter in a field both go through the form's submit handler,
 * which is also where a failed save is reported.
 *
 * Deleting is its own action and never submits the form, and Done is disabled
 * while it is in flight so a save cannot race a delete.
 */
export const TaskFormActions: React.FC<TaskFormActionsProps> = ({
  isValid,
  isSubmitting,
  onDelete,
  isDeleting = false,
}) => (
  <div className="flex w-full items-center justify-between gap-3">
    {onDelete && (
      <Button
        type="button"
        variant="danger-ghost"
        onClick={onDelete}
        isLoading={isDeleting}
        disabled={isSubmitting}
        leftIcon={isDeleting ? undefined : <Icon as={IconWind} size={18} aria-hidden="true" />}
      >
        Blow it away
      </Button>
    )}
    <Button type="submit" form={TASK_FORM_ID} className="ml-auto" disabled={!isValid || isSubmitting || isDeleting}>
      {isSubmitting ? 'Saving...' : 'Done'}
    </Button>
  </div>
);

/**
 * The task form's fields, given everything it renders.
 *
 * It holds no state of its own and asks for no data: both come from
 * `useTaskModal`, which is what lets the modal around it be a header and a
 * shell. The one exception is `UserPicker`, which resolves the name of an
 * owner the member list does not contain and owns that lookup itself.
 *
 * The order is the order a person decides in: what it is called, where it is,
 * how urgent it is and who has it, what colour it is, what it says, and what
 * is left to do.
 */
export const TaskForm: React.FC<TaskFormProps> = ({
  values,
  errors,
  submitError,
  setField,
  handleSubmit,
  colors,
  members,
  isLoadingColors,
  columns,
  columnId,
  onMove,
}) => (
  <form id={TASK_FORM_ID} onSubmit={handleSubmit} className="space-y-6">
    <Field label="Title" required error={errors.title}>
      {props => (
        <Input
          {...props}
          type="text"
          value={values.title}
          onChange={event => setField('title', event.target.value)}
          hasError={Boolean(errors.title)}
          placeholder="Enter task title"
        />
      )}
    </Field>

    {columns && columnId && onMove && <TaskMoveToPicker columns={columns} currentColumnId={columnId} onMove={onMove} />}

    <div className="grid gap-6 sm:grid-cols-2">
      <PrioritySelect value={values.priority} onChange={priority => setField('priority', priority)} />

      <Field label="Owner" required error={errors.owner}>
        {props => (
          <UserPicker
            value={values.owner}
            onChange={ownerId => setField('owner', ownerId)}
            members={members}
            controlProps={props}
          />
        )}
      </Field>
    </div>

    <SwatchPicker
      name="color"
      legend={
        <>
          <Icon as={IconPalette} size={16} className="mr-1 inline" aria-hidden="true" />
          Color *
        </>
      }
      options={colors.map(color => ({
        id: color._id,
        label: color.name ?? color.value,
        color: color.value,
      }))}
      value={values.color}
      onChange={colorId => setField('color', colorId)}
      error={errors.color}
      isLoading={isLoadingColors}
    />

    <Field label="Description">
      {props => (
        <Textarea
          {...props}
          value={values.description}
          onChange={event => setField('description', event.target.value)}
          rows={3}
          placeholder="Enter task description"
          className="font-body"
        />
      )}
    </Field>

    <Checklist
      items={values.checklist}
      onChange={checklist => setField('checklist', checklist)}
      pending={values.pendingItem}
      onPendingChange={text => setField('pendingItem', text)}
    />

    {submitError && (
      <div role="alert" className="rounded-control bg-danger-bg p-3 text-sm text-danger-strong">
        {submitError}
      </div>
    )}
  </form>
);

export default TaskForm;
