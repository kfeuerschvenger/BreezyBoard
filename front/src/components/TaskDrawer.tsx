import React, { useEffect, useState } from 'react';
import { User, Palette } from 'lucide-react';
import { ColorService, UserService } from '@/services';
import type { User as UserModel, Task } from '@/models';
import { Button, Drawer, Field, Input, Textarea } from '@/shared/ui';
import { UserPicker } from '@/features/users';
import { Checklist, PrioritySelect, useTaskForm } from '@/features/tasks';
import type { TaskColorOption } from '@/features/tasks';

// The legend of a group carries the same weight as a Field's label, so the
// grouped controls below read as part of the same form.
const LEGEND_CLASSES = 'block text-sm font-medium text-gray-700 mb-2 font-heading';

// Selection expressed with real radio inputs inside labels, hidden from
// sight but not from the accessibility tree: arrow keys move within the
// group, the group is announced as a group and the legend names it, all from
// the browser. The same shape as the two pickers in CreateBoardModal.
const SWATCH_CLASSES =
  'w-8 h-8 rounded-full border-2 transition-transform cursor-pointer inline-block ' +
  'border-gray-300 hover:border-gray-400 has-[:checked]:border-gray-900 has-[:checked]:scale-110 ' +
  'has-[:checked]:ring-2 has-[:checked]:ring-blue-500 ' +
  'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500';

interface TaskDrawerProps {
  open: boolean;
  onClose: () => void;
  task?: Partial<Task> | null;
  onSave: (task: Partial<Task>) => Promise<void>;
}

const TaskDrawer: React.FC<TaskDrawerProps> = ({ open, onClose, task = null, onSave }) => {
  const [isLoadingColors, setIsLoadingColors] = useState(true);
  const [taskColors, setTaskColors] = useState<TaskColorOption[]>([]);
  const [boardMembers, setBoardMembers] = useState<UserModel[]>([]);

  const { values, errors, isValid, isSubmitting, submitError, setField, handleSubmit } = useTaskForm({
    open,
    task,
    colors: taskColors,
    members: boardMembers,
    onSave,
    onSaved: onClose,
  });

  useEffect(() => {
    let mounted = true;

    const fetchColors = async () => {
      try {
        setIsLoadingColors(true);
        const colors = await ColorService.getByType('task');
        if (!mounted) return;
        setTaskColors(colors ?? []);
      } catch (error) {
        console.error('Failed to load colors', error);
        if (mounted) setTaskColors([]);
      } finally {
        if (mounted) setIsLoadingColors(false);
      }
    };

    fetchColors();
    return () => {
      mounted = false;
    };
  }, [task]);

  useEffect(() => {
    let mounted = true;

    const fetchMembers = async () => {
      if (!task?.boardId) {
        if (mounted) setBoardMembers([]);
        return;
      }
      try {
        const members = await UserService.getBoardMembers(task.boardId);
        if (!mounted) return;
        setBoardMembers(members);
      } catch (error) {
        console.error('Failed to load board members', error);
        if (mounted) setBoardMembers([]);
      }
    };

    fetchMembers();
    return () => {
      mounted = false;
    };
  }, [task]);

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

        <fieldset>
          <legend className={LEGEND_CLASSES}>
            <Palette size={16} className="inline mr-1" aria-hidden="true" />
            Color *
          </legend>
          {isLoadingColors ? (
            <div className="flex justify-center py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" />
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {taskColors.map(color => (
                  <label key={color._id} className={SWATCH_CLASSES} style={{ backgroundColor: color.value }}>
                    <input
                      type="radio"
                      name="color"
                      value={color._id}
                      className="sr-only"
                      checked={values.color === color._id}
                      onChange={() => setField('color', color._id)}
                    />
                    {/* The swatch is a block of colour and nothing else, so
                        the name has to be supplied here or the control is
                        announced as "radio" with no indication of which. */}
                    <span className="sr-only">{color.name ?? color.value}</span>
                  </label>
                ))}
              </div>
              {errors.color && (
                <p role="alert" className="mt-1 text-sm text-red-600">
                  {errors.color}
                </p>
              )}
            </>
          )}
        </fieldset>

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
