import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'motion/react';
import { IconLock } from '@tabler/icons-react';
import { Field, PasswordInput, Icon } from '@/shared/ui';

/**
 * The same strength rule as registration, which is also the rule the server
 * applies to a reset: a password this form accepts is never refused after
 * the request has already been sent.
 */
const resetPasswordSchema = z
  .object({
    newPassword: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/(?=.*[a-z])/, 'Password must contain a lowercase letter')
      .regex(/(?=.*[A-Z])/, 'Password must contain an uppercase letter')
      .regex(/(?=.*\d)/, 'Password must contain a number'),
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
  /** Shown above the fields, for a failure the form itself cannot predict. */
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

  return (
    <>
      {error && (
        <div role="alert" className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit(({ newPassword }) => onSubmit(newPassword))} onChange={onDirty} className="space-y-6" noValidate>
        <Field
          label="New password"
          error={errors.newPassword?.message}
          hint="At least 8 characters, with a lowercase letter, an uppercase letter and a number."
        >
          {props => (
            <PasswordInput
              {...props}
              {...register('newPassword')}
              autoComplete="new-password"
              placeholder="Create a strong password"
              icon={<Icon as={IconLock} className="h-5 w-5 text-gray-400" />}
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
              icon={<Icon as={IconLock} className="h-5 w-5 text-gray-400" />}
              toggleLabel="confirm new password"
            />
          )}
        </Field>

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer"
        >
          {isSubmitting ? 'Saving...' : 'Set new password'}
        </motion.button>
      </form>
    </>
  );
};

export default ResetPasswordForm;
