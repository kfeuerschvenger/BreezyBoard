import { Controller, useFormContext } from 'react-hook-form';
import type { Color } from '@/models';
import { Field, Input, SwatchPicker, Textarea } from '@/shared/ui';
import type { BoardFieldValues } from '../boardForm';

export interface BoardFormFieldsProps {
  colors: Color[];
}

/**
 * Name, description and colour: the part of a board's form that creating and
 * editing share.
 *
 * It reads the form from context instead of taking the form's methods as
 * props. The create dialog's form has a fourth field, so its type is wider
 * than `BoardFieldValues`, and the methods of a wider form do not satisfy a
 * prop typed for a narrower one. Context sidesteps that and leaves each
 * dialog to own its form, its defaults and its submit.
 */
export const BoardFormFields = ({ colors }: BoardFormFieldsProps) => {
  const {
    control,
    register,
    formState: { errors },
  } = useFormContext<BoardFieldValues>();

  return (
    <>
      <Field label="Board Name" required error={errors.title?.message}>
        {props => <Input {...props} {...register('title')} placeholder="Enter board name" />}
      </Field>

      <Field label="Description" error={errors.description?.message}>
        {props => (
          <Textarea {...props} {...register('description')} rows={3} placeholder="Describe your board's purpose" />
        )}
      </Field>

      <Controller
        name="color"
        control={control}
        render={({ field }) => (
          <SwatchPicker
            name={field.name}
            legend="Board Color"
            layout="grid"
            options={colors.map(color => ({
              id: color._id ?? color.value,
              label: color.name ?? color.value,
              color: color.value,
            }))}
            value={field.value}
            onChange={field.onChange}
          />
        )}
      />
    </>
  );
};

export default BoardFormFields;
