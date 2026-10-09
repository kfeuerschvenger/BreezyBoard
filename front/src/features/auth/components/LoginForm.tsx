import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { IconArrowRight } from '@tabler/icons-react';
import { Button, Field, Icon, Input, PasswordInput } from '@/shared/ui';
import type { LoginCredentials } from '@/models';
import { useShake } from '../useShake';
import { AuthBanner } from './AuthBanner';

/**
 * The messages are the page's own, not the browser's.
 *
 * The form is submitted with `noValidate` for the same reason: a validating
 * `type="email"` on a validating form makes the browser refuse the submit
 * before the handler runs, so the person sees the browser's wording with none
 * of this page's styling and the branch that writes "Email is invalid" can
 * never run at all.
 */
const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Email is invalid'),
  password: z.string().min(1, 'Password is required').min(6, 'Password must be at least 6 characters'),
});

export type LoginFormValues = z.infer<typeof loginSchema>;

export interface LoginFormProps {
  /** Rejects when the credentials are refused. */
  onSubmit: (credentials: LoginCredentials) => Promise<void>;
  /** Shown in the banner, for a failure the form itself cannot predict. */
  error: string | null;
  /** Called on the first keystroke after a failure, to clear it. */
  onDirty: () => void;
  onForgotPassword: () => void;
}

/**
 * The sign in form. A refused submit, whether the fields failed validation or
 * the server refused the credentials, shakes the form once.
 *
 * There is no "Remember me": nothing in the frontend or the backend would read
 * it, and a session that outlives the tab is a decision about the session
 * contract, not a checkbox.
 */
export const LoginForm: React.FC<LoginFormProps> = ({ onSubmit, error, onDirty, onForgotPassword }) => {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    mode: 'onSubmit',
    defaultValues: { email: '', password: '' },
  });
  const { ref, shake } = useShake<HTMLFormElement>(error, isSubmitting);

  return (
    <form
      ref={ref}
      onSubmit={handleSubmit(onSubmit, shake)}
      onChange={onDirty}
      className="flex flex-col gap-4.5"
      noValidate
    >
      <Field label="Email address" error={errors.email?.message}>
        {props => (
          <Input {...props} {...register('email')} type="email" autoComplete="email" placeholder="you@company.com" />
        )}
      </Field>

      <Field
        label="Password"
        error={errors.password?.message}
        labelAside={
          // A button, not a link: it opens a dialog on this page and navigates
          // nowhere.
          <button
            type="button"
            onClick={onForgotPassword}
            className="focus-ring -my-1.5 min-h-8 cursor-pointer rounded-chip px-1 text-[13px] font-medium text-link transition-colors hover:text-ink"
          >
            Forgot it?
          </button>
        }
      >
        {props => (
          <PasswordInput
            {...props}
            {...register('password')}
            autoComplete="current-password"
            placeholder="At least 6 characters"
          />
        )}
      </Field>

      {error && <AuthBanner>{error}</AuthBanner>}

      <Button type="submit" size="lg" isLoading={isSubmitting} className="w-full">
        {isSubmitting ? (
          'Signing in...'
        ) : (
          <>
            Sign in
            <Icon as={IconArrowRight} size={18} />
          </>
        )}
      </Button>
    </form>
  );
};

export default LoginForm;
