import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, Field, PasswordInput } from '@/shared/ui';
import { newPasswordSchema, PASSWORD_RULE_HINT } from '@/shared/lib/passwordRule';
import { useChangePassword } from '../hooks/useChangePassword';
import { ProfilePanel } from './ProfilePanel';

const passwordFormSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: newPasswordSchema,
    confirmPassword: z.string().min(1, 'Please confirm your new password'),
  })
  .refine(values => values.newPassword === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

type PasswordFormValues = z.infer<typeof passwordFormSchema>;

/**
 * "Password": change the password of the signed in account.
 *
 * It is a form of its own, apart from About you, because it has its own
 * submit and its own consequence: the server ends every session of the account
 * when it succeeds, this one included, so the person lands on the sign in
 * screen. The description says so before the button is pressed.
 *
 * A wrong current password is said under that field, not in a banner, since
 * it is the field to fix. Anything else the server refuses is a banner.
 */
export const PasswordPanel: React.FC = () => {
  const { changePassword } = useChangePassword();
  const [failed, setFailed] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordFormSchema),
    mode: 'onSubmit',
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  const onSubmit = handleSubmit(async ({ currentPassword, newPassword }) => {
    setFailed(false);
    const outcome = await changePassword(currentPassword, newPassword);

    if (outcome === 'wrong-current') {
      setError('currentPassword', { message: 'That is not your current password' }, { shouldFocus: true });
    } else if (outcome === 'failed') {
      setFailed(true);
    }
  });

  return (
    <ProfilePanel
      title="Password"
      description="Changing it signs you out everywhere, this device included. You sign in again with the new one."
    >
      <form className="flex flex-col gap-4.5" onSubmit={onSubmit} onChange={() => setFailed(false)} noValidate>
        <Field label="Current password" error={errors.currentPassword?.message}>
          {props => (
            <PasswordInput
              {...props}
              {...register('currentPassword')}
              autoComplete="current-password"
              toggleLabel="current password"
            />
          )}
        </Field>

        <Field label="New password" error={errors.newPassword?.message} hint={PASSWORD_RULE_HINT}>
          {props => (
            <PasswordInput
              {...props}
              {...register('newPassword')}
              autoComplete="new-password"
              toggleLabel="new password"
            />
          )}
        </Field>

        <Field label="Confirm new password" error={errors.confirmPassword?.message}>
          {props => (
            <PasswordInput
              {...props}
              {...register('confirmPassword')}
              autoComplete="new-password"
              toggleLabel="confirm new password"
            />
          )}
        </Field>

        {failed && (
          <p role="alert" className="rounded-control bg-danger-bg px-3.5 py-2.5 text-sm font-medium text-danger-strong">
            We could not change your password. Please try again.
          </p>
        )}

        <div className="flex justify-end">
          <Button type="submit" variant="secondary" isLoading={isSubmitting}>
            {isSubmitting ? 'Changing...' : 'Change password'}
          </Button>
        </div>
      </form>
    </ProfilePanel>
  );
};

export default PasswordPanel;
