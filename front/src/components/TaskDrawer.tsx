import React from 'react';
import { User, Palette } from 'lucide-react';
import type { User as UserModel, Task } from '@/models';
import { Button, Drawer, Field, Input, SwatchPicker, Textarea } from '@/shared/ui';
import { UserPicker, useBoardMembers } from '@/features/users';
import { useColors } from '@/features/colors';
import { Checklist, PrioritySelect, useTaskForm } from '@/features/tasks';
import type { TaskColorOption } from '@/features/tasks';

interface TaskDrawerProps {
  open: boolean;
  onClose: () => void;
  task?: Partial<Task> | null;
  onSave: (task: Partial<Task>) => Promise<void>;
}

// Stable identities for the two lists while their requests are in flight or
// have failed. `useTaskForm` keys three effects on these, so a fresh literal
// here would re-run all three on every render of the drawer.
const NO_COLORS: TaskColorOption[] = [];
const NO_MEMBERS: UserModel[] = [];

const TaskDrawer: React.FC<TaskDrawerProps> = ({ open, onClose, task = null, onSave }) => {
  const { data: taskColors = NO_COLORS, isPending: isLoadingColors } = useColors('task');
  const { data: boardMembers = NO_MEMBERS } = useBoardMembers(task?.boardId);

  const { values, errors, isValid, isSubmitting, submitError, setField, handleSubmit } = useTaskForm({
    open,
    task,
    colors: taskColors,
    members: boardMembers,
    onSave,
    onSaved: onClose,
  });

  const drawerTitle = task?._id ? 'Edit Task' : 'Create New Task';

  return (
    <Drawer open={open} onClose={onClose} title={drawerTitle}>
      <form onSubmit={handleSubmit} className="space-y-6">
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

        <Field label="Description" required error={errors.description}>
          {props => (
            <Textarea
              {...props}
              value={values.description}
              onChange={event => setField('description', event.target.value)}
              rows={3}
              hasError={Boolean(errors.description)}
              placeholder="Enter task description"
              className="font-body"
            />
          )}
        </Field>

        <Field label="Owner" required error={errors.owner} icon={<User size={16} className="text-gray-400" />}>
          {props => (
            <UserPicker
              value={values.owner}
              onChange={ownerId => setField('owner', ownerId)}
              members={boardMembers}
              controlProps={props}
            />
          )}
        </Field>

        <PrioritySelect value={values.priority} onChange={priority => setField('priority', priority)} />

        <SwatchPicker
          name="color"
          legend={
            <>
              <Palette size={16} className="inline mr-1" aria-hidden="true" />
              Color *
            </>
          }
          options={taskColors.map(color => ({
            id: color._id,
            label: color.name ?? color.value,
            color: color.value,
          }))}
          value={values.color}
          onChange={colorId => setField('color', colorId)}
          error={errors.color}
          isLoading={isLoadingColors}
        />

        <Checklist items={values.checklist} onChange={checklist => setField('checklist', checklist)} />

        {submitError && (
          <div role="alert" className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            {submitError}
          </div>
        )}

        <div className="flex gap-3 pt-4">
          <Button type="submit" disabled={!isValid || isSubmitting} className="flex-1 justify-center">
            {isSubmitting ? 'Saving...' : 'Save Changes'}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Drawer>
  );
};

export default TaskDrawer;
