import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import { Lock, Mail } from 'lucide-react';
import { Field, Input, PasswordInput } from '@/shared/ui';
import type { LoginCredentials } from '@/models';

/**
 * The messages are the page's own, not the browser's.
 *
 * The form is submitted with `noValidate` for the same reason. The email
 * field used to be a validating `type="email"` on a validating form, so the
 * browser refused the submit before the handler ran: the person saw the
 * browser's wording with none of this page's styling, and the branch that
 * wrote "Email is invalid" could never run at all.
 */
const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Email is invalid'),
  password: z.string().min(1, 'Password is required').min(6, 'Password must be at least 6 characters'),
});

export type LoginFormValues = z.infer<typeof loginSchema>;

export interface LoginFormProps {
  /** Rejects when the credentials are refused. */
  onSubmit: (credentials: LoginCredentials) => Promise<void>;
  /** Shown above the fields, for a failure the form itself cannot predict. */
  error: string | null;
  /** Called on the first keystroke after a failure, to clear it. */
  onDirty: () => void;
  onForgotPassword: () => void;
}

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

  return (
    <>
      {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}

      <form onSubmit={handleSubmit(onSubmit)} onChange={onDirty} className="space-y-6" noValidate>
        <Field label="Email address" error={errors.email?.message} icon={<Mail className="h-5 w-5 text-gray-400" />}>
          {props => <Input {...props} {...register('email')} placeholder="Enter your email" className="pl-10" />}
        </Field>

        <Field label="Password" error={errors.password?.message}>
          {props => (
            <PasswordInput
              {...props}
              {...register('password')}
              placeholder="Enter your password"
              icon={<Lock className="h-5 w-5 text-gray-400" />}
            />
          )}
        </Field>

        <div className="flex items-center justify-between">
          {/*
            Carried over unchanged, and it does nothing. The checkbox is
            uncontrolled, nothing reads it and nothing sends it, so ticking it
            has no effect anywhere in the product. That is finding P4-14, and
            it is left exactly as it was because removing a control a person
            can see is a product decision rather than part of a move.
          */}
          <div className="flex items-center">
            <input
              id="remember-me"
              name="remember-me"
              type="checkbox"
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
            />
            <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-700">
              Remember me
            </label>
          </div>

          {/*
            A button, not a link. It opens a dialog on this page and
            navigates nowhere, and it used to be a `Link to="#"` with the
            navigation cancelled in its own handler.
          */}
          <button
            type="button"
            onClick={onForgotPassword}
            className="text-sm text-blue-600 hover:text-blue-500 font-medium cursor-pointer"
          >
            Forgot password?
          </button>
        </div>

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer"
        >
          {isSubmitting ? 'Signing in...' : 'Sign in'}
        </motion.button>
      </form>
    </>
  );
};

export default LoginForm;
