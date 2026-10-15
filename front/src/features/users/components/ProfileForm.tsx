import React from 'react';
import { IconMail, IconMapPin, IconUser } from '@tabler/icons-react';
import type { UseFormReturn } from 'react-hook-form';
import { Field, Input, Icon } from '@/shared/ui';
import type { ProfileFormValues } from '../hooks/useProfile';
import { ProfileActions } from './ProfileActions';
import { ProfilePanel } from './ProfilePanel';

export interface ProfileFormProps {
  form: UseFormReturn<ProfileFormValues>;
  /** The one message worth showing, whether the read or a write produced it. */
  error: string | null;
  onSubmit: React.FormEventHandler<HTMLFormElement>;
  onCancel: () => void;
}

/** The editable fields below the two names, in the order the form asks for them. */
const FIELDS = [
  { name: 'email', label: 'Email address', placeholder: 'Enter email address', type: 'email', icon: IconMail },
  { name: 'location', label: 'Location', placeholder: 'Enter location', icon: IconMapPin },
  { name: 'role', label: 'Role', placeholder: 'Enter your role' },
  { name: 'department', label: 'Department', placeholder: 'Enter department' },
] as const;

/**
 * "About you": the fields of the person's record. A bio belongs here and is
 * not here yet (Phase 8d), and the joined date is not a field, it is the line
 * under the name.
 */
export const ProfileForm: React.FC<ProfileFormProps> = ({ form, error, onSubmit, onCancel }) => {
  const {
    register,
    formState: { errors, isDirty, isValid, isSubmitting },
  } = form;

  return (
    <ProfilePanel title="About you">
      <form className="flex flex-col gap-5" onSubmit={onSubmit} noValidate>
        {/* The two names sit side by side from `sm`; everything below is full width. */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="First name" error={errors.firstName?.message} icon={<Icon as={IconUser} size={16} />}>
            {props => <Input {...props} {...register('firstName')} placeholder="Enter first name" className="pl-10" />}
          </Field>
          <Field label="Last name" error={errors.lastName?.message} icon={<Icon as={IconUser} size={16} />}>
            {props => <Input {...props} {...register('lastName')} placeholder="Enter last name" className="pl-10" />}
          </Field>
        </div>

        {FIELDS.map(field => {
          const glyph = 'icon' in field ? field.icon : undefined;

          return (
            <Field
              key={field.name}
              label={field.label}
              error={errors[field.name]?.message}
              icon={glyph ? <Icon as={glyph} size={16} /> : undefined}
            >
              {props => (
                <Input
                  {...props}
                  {...register(field.name)}
                  type={'type' in field ? field.type : undefined}
                  placeholder={field.placeholder}
                  className={glyph ? 'pl-10' : undefined}
                />
              )}
            </Field>
          );
        })}

        {error && (
          <p role="alert" className="rounded-control bg-danger-bg px-3.5 py-2.5 text-sm font-medium text-danger-strong">
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-3 border-t border-line-08 pt-5">
          <ProfileActions isDirty={isDirty} isValid={isValid} isSubmitting={isSubmitting} onCancel={onCancel} />
        </div>
      </form>
    </ProfilePanel>
  );
};

export default ProfileForm;
