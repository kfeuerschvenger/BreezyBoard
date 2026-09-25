import React, { useEffect, useRef, useState } from 'react';
import { User, Palette, Flag } from 'lucide-react';
import { ColorService, UserService } from '@/services';
import type { User as UserModel, Task } from '@/models';
import { useDraft } from '@/shared/hooks/useDraft';
import { Button, Drawer, Field, Input, Textarea } from '@/shared/ui';
import { UserPicker } from '@/features/users';
import { Checklist } from '@/features/tasks';
import type { ChecklistItemData } from '@/features/tasks';

// The legend of a group carries the same weight as a Field's label, so the
// three grouped controls below read as part of the same form.
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

type TaskColorOption = { _id: string; name?: string; value: string };

/**
 * A task colour arrives either populated, as an id, or as a raw hex value.
 * Resolves all three to the id of a known colour, falling back to the raw value
 * so an unknown colour is not silently discarded.
 */
const resolveColorId = (taskColor: Task['color'] | undefined, colors: TaskColorOption[]): string => {
  if (!taskColor) return '';
  if (typeof taskColor === 'object') return (taskColor as { _id?: string })._id ?? '';
  const foundByValue = colors.find(color => color.value.toLowerCase() === String(taskColor).toLowerCase());
  return foundByValue?._id ?? String(taskColor);
};

// ----------------------
// TaskDrawer component
// ----------------------
const TaskDrawer: React.FC<TaskDrawerProps> = ({ open, onClose, task = null, onSave }) => {
  const [isLoadingColors, setIsLoadingColors] = useState(true);
  const [taskColors, setTaskColors] = useState<TaskColorOption[]>([]);
  // Read by the reset effect without making it depend on the colors, which would
  // re-run it and discard whatever the user has typed.
  const taskColorsRef = useRef<TaskColorOption[]>([]);
  taskColorsRef.current = taskColors;
  const [boardMembers, setBoardMembers] = useState<UserModel[]>([]);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    priority: 'medium' as 'low' | 'medium' | 'high',
    color: '',
    owner: '',
    checklist: [] as ChecklistItemData[],
  });
  const [errors, setErrors] = useState<{
    title?: string;
    description?: string;
    owner?: string;
    color?: string;
  }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Persists an in-progress edit across a reload or an accidental close.
  // Gated to null while the drawer is closed so nothing is read or written
  // for a drawer nobody has open.
  const draftKey = open ? `task:${task?._id ?? 'new:' + (task?.boardId ?? 'unknown')}` : null;
  const draft = useDraft<typeof formData>(draftKey);

  // Load colors
  useEffect(() => {
    let mounted = true;
    const fetchColors = async () => {
      try {
        setIsLoadingColors(true);
        const colors = await ColorService.getByType('task');
        if (!mounted) return;
        setTaskColors(colors ?? []);

        // Preselect first color for new tasks
        if (!task && colors && colors.length > 0) {
          setFormData(prev => ({
            ...prev,
            color: prev.color || colors[0]._id,
          }));
        }
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

  // Load board members when task.boardId changes
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

        // Preselect the only member if there's only one
        if (!task && members.length === 1) {
          setFormData(prev => ({
            ...prev,
            owner: prev.owner || members[0]._id,
          }));
        }
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

  // Reset the form when a different task is opened.
  //
  // taskColors is deliberately NOT a dependency here. It starts empty and is
  // replaced once the colors request resolves, so listing it rebuilt the whole
  // form from the task a second time after mount and silently wiped whatever the
  // user had already typed. Resolving the colour is handled by the effect below,
  // which patches that one field instead of rebuilding everything.
  useEffect(() => {
    if (!task) {
      setErrors({});
      return;
    }

    // Determine owner id from task.owner
    let ownerId = '';
    if (task.owner) {
      if (typeof task.owner === 'object') {
        ownerId = task.owner._id ?? '';
      } else {
        ownerId = task.owner;
      }
    }

    const baseFormData = {
      title: task.title ?? '',
      description: task.description ?? '',
      priority: task.priority ?? 'medium',
      color: resolveColorId(task.color, taskColorsRef.current),
      owner: ownerId,
      checklist:
        task.checklist?.map(item => ({
          id: item._id ?? (crypto?.randomUUID ? crypto.randomUUID() : Date.now().toString()),
          text: item.text,
          completed: item.completed,
        })) ?? [],
    };

    // A saved draft, when one exists, takes priority over rebuilding the
    // form from the task prop: it is exactly the in-progress edit the user
    // had not saved yet.
    const restoredDraft = draft.read();
    setFormData(restoredDraft ?? baseFormData);

    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task]);

  // The colors arrive asynchronously. Patch only the colour field, and only when
  // the one currently held is not already a valid choice, so a colour the user
  // picked by hand is never overwritten.
  useEffect(() => {
    if (!task || taskColors.length === 0) return;

    setFormData(prev => {
      if (taskColors.some(color => color._id === prev.color)) return prev;
      const resolved = resolveColorId(task.color, taskColors) || taskColors[0]._id;
      return prev.color === resolved ? prev : { ...prev, color: resolved };
    });
  }, [task, taskColors]);

  // Autosave: fires on every change while the drawer is open. Depends on
  // draft.write (stable per draft key) rather than the whole draft object,
  // so it does not re-fire on every unrelated render.
  useEffect(() => {
    if (!open) return;
    draft.write(formData);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData, open, draft.write]);

  const priorities = [
    { value: 'low', label: 'Low', color: 'bg-green-100 text-green-800' },
    { value: 'medium', label: 'Medium', color: 'bg-yellow-100 text-yellow-800' },
    { value: 'high', label: 'High', color: 'bg-red-100 text-red-800' },
  ];

  // Validate form function
  const validateForm = (): boolean => {
    const newErrors: { title?: string; description?: string; owner?: string; color?: string } = {};
    let isValid = true;

    if (!formData.title.trim()) {
      newErrors.title = 'Title is required';
      isValid = false;
    }

    if (!formData.description.trim()) {
      newErrors.description = 'Description is required';
      isValid = false;
    }

    if (!formData.owner) {
      newErrors.owner = 'Owner is required';
      isValid = false;
    }

    if (!formData.color) {
      newErrors.color = 'Color is required';
      isValid = false;
    }

    setErrors(newErrors);
    return isValid;
  };

  // Check if form is valid for submission
  const isFormValid = (): boolean => {
    return (
      formData.title.trim() !== '' &&
      formData.description.trim() !== '' &&
      formData.owner !== '' &&
      formData.color !== '' &&
      // Check for error values, not keys: a cleared error is stored as undefined
      // under an existing key, so counting keys keeps the form permanently invalid.
      Object.values(errors).every(message => !message)
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm() || isSubmitting) return;

    setSubmitError(null);
    setIsSubmitting(true);
    try {
      const taskData: Partial<Task> = {
        title: formData.title,
        description: formData.description,
        priority: formData.priority,
        color: formData.color,
        owner: formData.owner,
        checklist: formData.checklist.map(item => ({
          text: item.text,
          completed: item.completed,
          ...(item.id && !item.id.startsWith('temp-') && { _id: item.id }),
        })),
      };

      if (task && task._id) {
        taskData._id = task._id;
        taskData.boardId = task.boardId;
        taskData.status = task.status;
      } else if (task) {
        taskData.boardId = task.boardId;
        taskData.status = task.status;
      }

      await onSave(taskData);
      draft.clear();
      onClose();
    } catch (error) {
      console.error('Error saving task:', error);
      // A failed save used to look identical to an idle form. Tell the user.
      setSubmitError('The task could not be saved. Check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOwnerChange = (ownerId: string) => {
    setFormData(prev => ({ ...prev, owner: ownerId }));
    setErrors(prev => ({ ...prev, owner: undefined }));
  };

  const drawerTitle = task?._id ? 'Edit Task' : 'Create New Task';

  return (
    <Drawer open={open} onClose={onClose} title={drawerTitle}>
      <form onSubmit={handleSubmit} className="space-y-6">
        <Field label="Title" required error={errors.title}>
          {props => (
            <Input
              {...props}
              type="text"
              value={formData.title}
              onChange={e => setFormData(prev => ({ ...prev, title: e.target.value }))}
              hasError={Boolean(errors.title)}
              placeholder="Enter task title"
            />
          )}
        </Field>

        <Field label="Description" required error={errors.description}>
          {props => (
            <Textarea
              {...props}
              value={formData.description}
              onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
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
              value={formData.owner}
              onChange={handleOwnerChange}
              members={boardMembers}
              controlProps={props}
            />
          )}
        </Field>

        <fieldset>
          <legend className={LEGEND_CLASSES}>
            <Flag size={16} className="inline mr-1" aria-hidden="true" />
            Priority
          </legend>
          <div className="flex gap-2">
            {priorities.map(priority => (
              <label
                key={priority.value}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer bg-gray-100 text-gray-600 hover:bg-gray-200 has-[:checked]:${priority.color} has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500`}
              >
                <input
                  type="radio"
                  name="priority"
                  value={priority.value}
                  className="sr-only"
                  checked={formData.priority === priority.value}
                  onChange={() =>
                    setFormData(prev => ({ ...prev, priority: priority.value as 'low' | 'medium' | 'high' }))
                  }
                />
                {priority.label}
              </label>
            ))}
          </div>
        </fieldset>

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
                  <label
                    key={color._id}
                    className={SWATCH_CLASSES}
                    style={{ backgroundColor: color.value }}
                  >
                    <input
                      type="radio"
                      name="color"
                      value={color._id}
                      className="sr-only"
                      checked={formData.color === color._id}
                      onChange={() => setFormData(prev => ({ ...prev, color: color._id }))}
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

        <Checklist
          items={formData.checklist}
          onChange={checklist => setFormData(prev => ({ ...prev, checklist }))}
        />

        {submitError && (
          <div role="alert" className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            {submitError}
          </div>
        )}

        <div className="flex gap-3 pt-4">
          <Button type="submit" disabled={!isFormValid() || isSubmitting} className="flex-1 justify-center">
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
