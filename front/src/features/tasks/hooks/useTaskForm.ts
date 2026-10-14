import React, { useEffect, useRef, useState } from 'react';
import type { Task, User as UserModel } from '@/models';
import { useDraft } from '@/shared/hooks/useDraft';
import type { ChecklistItemData } from '../components/Checklist';
import type { TaskPriority } from '../components/PrioritySelect';

export interface TaskColorOption {
  _id: string;
  name?: string;
  value: string;
}

export interface TaskFormValues {
  title: string;
  description: string;
  priority: TaskPriority;
  color: string;
  owner: string;
  checklist: ChecklistItemData[];
}

/** The description is optional, so it never has an error of its own. */
export type TaskFormErrors = Partial<Record<'title' | 'owner' | 'color', string>>;

export interface UseTaskFormOptions {
  open: boolean;
  task: Partial<Task> | null;
  /** Arrives asynchronously, so the colour is patched rather than preselected. */
  colors: TaskColorOption[];
  members: UserModel[];
  onSave: (task: Partial<Task>) => Promise<void>;
  /** Called after a save the server accepted, so the caller can close. */
  onSaved: () => void;
}

export interface UseTaskFormResult {
  values: TaskFormValues;
  errors: TaskFormErrors;
  isValid: boolean;
  isSubmitting: boolean;
  submitError: string | null;
  setField: <K extends keyof TaskFormValues>(name: K, value: TaskFormValues[K]) => void;
  handleSubmit: (event: React.FormEvent) => void;
}

const EMPTY_VALUES: TaskFormValues = {
  title: '',
  description: '',
  priority: 'medium',
  color: '',
  owner: '',
  checklist: [],
};

const newItemId = (): string => (crypto?.randomUUID ? crypto.randomUUID() : Date.now().toString());

/**
 * A task colour arrives either populated, as an id, or as a raw hex value.
 * Resolves all three to the id of a known colour, falling back to the raw value
 * so an unknown colour is not silently discarded.
 */
export const resolveColorId = (taskColor: Task['color'] | undefined, colors: TaskColorOption[]): string => {
  if (!taskColor) return '';
  if (typeof taskColor === 'object') return (taskColor as { _id?: string })._id ?? '';
  const foundByValue = colors.find(color => color.value.toLowerCase() === String(taskColor).toLowerCase());
  return foundByValue?._id ?? String(taskColor);
};

const ownerIdOf = (owner: Task['owner'] | undefined): string => {
  if (!owner) return '';
  return typeof owner === 'object' ? (owner._id ?? '') : owner;
};

/**
 * Owns everything about the task form's state: the values, the errors, the
 * draft, and the submission.
 *
 * It owns them together on purpose. Four effects write to these values, and
 * splitting them between a hook and its caller is what produces the defect
 * this form has hit twice, where one writer rebuilds the whole object and
 * discards what another had just put in it.
 *
 * The submit gate reads error VALUES rather than error keys, which is the
 * whole of P0-1: clearing an error stores `undefined` under a key that stays
 * in the object, so counting keys leaves the form permanently unsubmittable.
 * Anything replacing this check has to keep that property.
 */
export function useTaskForm({
  open,
  task,
  colors,
  members,
  onSave,
  onSaved,
}: UseTaskFormOptions): UseTaskFormResult {
  const [values, setValues] = useState<TaskFormValues>(EMPTY_VALUES);
  const [errors, setErrors] = useState<TaskFormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Read by the reset effect without making it depend on the colours, which
  // would re-run it and discard whatever the user has typed.
  const colorsRef = useRef<TaskColorOption[]>([]);
  colorsRef.current = colors;

  // Set by the rebuild effect and consumed by the autosave effect, which run in
  // the same commit, in that order.
  const awaitingHydration = useRef(false);

  // Persists an in-progress edit across a reload or an accidental close.
  // Gated to null while the drawer is closed so nothing is read or written
  // for a form nobody has open.
  const draftKey = open ? `task:${task?._id ?? 'new:' + (task?.boardId ?? 'unknown')}` : null;
  const draft = useDraft<TaskFormValues>(draftKey);

  // Rebuild the form when a different task is opened.
  //
  // The colours are deliberately not a dependency. They start empty and are
  // replaced once their request resolves, so listing them rebuilds the whole
  // form from the task a second time after mount and silently wipes whatever
  // the user has already typed. The effect below patches that one field
  // instead of rebuilding everything.
  useEffect(() => {
    if (!task) {
      setErrors({});
      return;
    }

    const fromTask: TaskFormValues = {
      title: task.title ?? '',
      description: task.description ?? '',
      priority: task.priority ?? 'medium',
      color: resolveColorId(task.color, colorsRef.current),
      owner: ownerIdOf(task.owner),
      checklist:
        task.checklist?.map(item => ({
          id: item._id ?? newItemId(),
          text: item.text,
          completed: item.completed,
        })) ?? [],
    };

    // A saved draft, when one exists, wins over rebuilding from the task
    // prop: it is exactly the in-progress edit that was never saved.
    const restoredDraft = draft.read();
    // The autosave effect below runs in this same commit, still holding the
    // values the form was built with. Left alone it writes them over the draft
    // that has just been read, and the restored values are only written back
    // when the throttle's trailing write fires, so a page lost in between
    // loses the draft.
    awaitingHydration.current = true;
    setValues(restoredDraft ?? fromTask);
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task]);

  // Patch only the colour, and only when the one currently held is not
  // already a valid choice, so a colour chosen by hand is never overwritten.
  useEffect(() => {
    if (!task || colors.length === 0) return;

    setValues(previous => {
      if (colors.some(color => color._id === previous.color)) return previous;
      const resolved = resolveColorId(task.color, colors) || colors[0]._id;
      return previous.color === resolved ? previous : { ...previous, color: resolved };
    });
  }, [task, colors]);

  // Preselect for a form opened with no task at all. Distinct from the patch
  // above, which covers a task that exists and has a colour to resolve.
  useEffect(() => {
    if (task || colors.length === 0) return;
    setValues(previous => (previous.color ? previous : { ...previous, color: colors[0]._id }));
  }, [task, colors]);

  // A board with exactly one member has only one possible owner, so choosing
  // it is not a decision worth asking for.
  useEffect(() => {
    if (task || members.length !== 1) return;
    setValues(previous => (previous.owner ? previous : { ...previous, owner: members[0]._id }));
  }, [task, members]);

  // Autosave on every change while the form is open. Depends on draft.write,
  // which is stable per draft key, rather than on the whole draft object, so
  // it does not re-fire on every unrelated render.
  useEffect(() => {
    if (!open) return;
    // The commit that rebuilt the form from a task still carries the old
    // values. The rebuilt ones arrive in the next render, and are written then.
    if (awaitingHydration.current) {
      awaitingHydration.current = false;
      return;
    }
    draft.write(values);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, open, draft.write]);

  const setField = <K extends keyof TaskFormValues>(name: K, value: TaskFormValues[K]) => {
    setValues(previous => ({ ...previous, [name]: value }));

    // Only the owner clears its own error as it changes. Title and
    // description keep theirs until the next submit, which is an
    // inconsistency rather than a rule, and changing it belongs with the
    // validation rewrite rather than with a move.
    if (name === 'owner') {
      setErrors(previous => ({ ...previous, owner: undefined }));
    }
  };

  const validate = (): boolean => {
    const found: TaskFormErrors = {};

    if (!values.title.trim()) found.title = 'Title is required';
    if (!values.owner) found.owner = 'Owner is required';
    if (!values.color) found.color = 'Color is required';

    setErrors(found);
    return Object.keys(found).length === 0;
  };

  const isValid =
    values.title.trim() !== '' &&
    values.owner !== '' &&
    values.color !== '' &&
    // Error values, not keys: a cleared error is stored as undefined under a
    // key that remains, so counting keys keeps the form permanently invalid.
    Object.values(errors).every(message => !message);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validate() || isSubmitting) return;

    setSubmitError(null);
    setIsSubmitting(true);
    try {
      const payload: Partial<Task> = {
        title: values.title,
        description: values.description,
        priority: values.priority,
        color: values.color,
        owner: values.owner,
        checklist: values.checklist.map(item => ({
          text: item.text,
          completed: item.completed,
          ...(item.id && !item.id.startsWith('temp-') && { _id: item.id }),
        })),
      };

      if (task && task._id) {
        payload._id = task._id;
        payload.boardId = task.boardId;
        payload.status = task.status;
      } else if (task) {
        payload.boardId = task.boardId;
        payload.status = task.status;
      }

      await onSave(payload);
      draft.clear();
      onSaved();
    } catch (error) {
      console.error('Error saving task:', error);
      // A failed save used to look identical to an idle form. Say so.
      setSubmitError('The task could not be saved. Check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return { values, errors, isValid, isSubmitting, submitError, setField, handleSubmit };
}

export default useTaskForm;
