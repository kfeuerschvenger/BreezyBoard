import React from 'react';
import { User, Palette } from 'lucide-react';
import { Button, Field, Input, SwatchPicker, Textarea } from '@/shared/ui';
import { UserPicker } from '@/features/users';
import { Checklist } from './Checklist';
import { PrioritySelect } from './PrioritySelect';
import type { UseTaskDrawerResult } from '../hooks/useTaskDrawer';

export interface TaskFormProps extends UseTaskDrawerResult {
  onCancel: () => void;
}

/**
 * The task form's fields and its two buttons, given everything it renders.
 *
 * It holds no state of its own and asks for no data: both come from
 * `useTaskDrawer`, which is what lets the drawer around it be a title and a
 * shell. The one exception is `UserPicker`, which resolves the name of an
 * owner the member list does not contain and owns that lookup itself.
 */
export const TaskForm: React.FC<TaskFormProps> = ({
  values,
  errors,
  isValid,
  isSubmitting,
  submitError,
  setField,
  handleSubmit,
  colors,
  members,
  isLoadingColors,
  onCancel,
}) => (
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
          members={members}
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
      <Button type="button" variant="secondary" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  </form>
);

export default TaskForm;
