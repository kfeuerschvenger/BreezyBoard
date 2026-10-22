import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { IconArrowRight } from '@tabler/icons-react';
import { Button, Field, Icon, PasswordInput } from '@/shared/ui';
import { newPasswordSchema, PASSWORD_RULE_HINT } from '@/shared/lib/passwordRule';
import { useShake } from '../useShake';
import { AuthBanner } from './AuthBanner';

/**
 * The same strength rule as registration, which is also the rule the server
 * applies to a reset: a password this form accepts is never refused after
 * the request has already been sent.
 */
const resetPasswordSchema = z
  .object({
    newPassword: newPasswordSchema,
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine(values => values.newPassword === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;

export interface ResetPasswordFormProps {
  /** Receives the new password. Rejects when the reset is refused. */
  onSubmit: (newPassword: string) => Promise<void>;
  /** Shown in the banner, for a failure the form itself cannot predict. */
  error: string | null;
  /** Called on the first keystroke after a failure, to clear it. */
  onDirty: () => void;
}

export const ResetPasswordForm: React.FC<ResetPasswordFormProps> = ({ onSubmit, error, onDirty }) => {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    mode: 'onSubmit',
    defaultValues: { newPassword: '', confirmPassword: '' },
  });
  const { ref, shake } = useShake<HTMLFormElement>(error, isSubmitting);

  return (
    <form
      ref={ref}
      onSubmit={handleSubmit(({ newPassword }) => onSubmit(newPassword), shake)}
      onChange={onDirty}
      className="flex flex-col gap-4.5"
      noValidate
    >
      <Field
        label="New password"
        error={errors.newPassword?.message}
        hint={PASSWORD_RULE_HINT}
      >
        {props => (
          <PasswordInput
            {...props}
            {...register('newPassword')}
            autoComplete="new-password"
            placeholder="Create a strong password"
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
            placeholder="Confirm your password"
            toggleLabel="confirm new password"
          />
        )}
      </Field>

      {error && <AuthBanner>{error}</AuthBanner>}

      <Button type="submit" size="lg" isLoading={isSubmitting} className="w-full">
        {isSubmitting ? (
          'Saving...'
        ) : (
          <>
            Set new password
            <Icon as={IconArrowRight} size={18} />
          </>
        )}
      </Button>
    </form>
  );
};

export default ResetPasswordForm;
