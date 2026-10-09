import React from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { IconArrowRight } from '@tabler/icons-react';
import { Button, Field, Icon, Input, PasswordInput } from '@/shared/ui';
import type { RegisterCredentials } from '@/models';
import { useShake } from '../useShake';
import { AuthBanner } from './AuthBanner';

/**
 * Validation schema using zod
 * - terms must be true
 * - confirmPassword must match password (refinement)
 */
const registerSchema = z
  .object({
    firstName: z.string().min(1, 'First name is required'),
    lastName: z.string().min(1, 'Last name is required'),
    email: z.string().email('Email is invalid'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/(?=.*[a-z])/, 'Password must contain a lowercase letter')
      .regex(/(?=.*[A-Z])/, 'Password must contain an uppercase letter')
      .regex(/(?=.*\d)/, 'Password must contain a number'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
    terms: z.boolean().refine(value => value === true, { message: 'You must accept the terms' }),
  })
  .refine(data => data.password === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

type RegisterFormValues = z.infer<typeof registerSchema>;

export interface RegisterFormProps {
  /** Rejects when the account could not be created. */
  onSubmit: (credentials: RegisterCredentials) => Promise<void>;
  /** Shown in the banner, for a failure the form itself cannot predict. */
  error: string | null;
  /** Called on the first keystroke after a failure, to clear it. */
  onDirty: () => void;
}

/**
 * The sign up form. The submit stays disabled until every field is valid and
 * the terms are accepted, so a refused submit is always the server's and
 * shakes the form through the banner's error.
 *
 * The terms are accepted here and read through the legal links the auth screen
 * carries under the form, which open the same dialogs as the sidebar's.
 */
export const RegisterForm: React.FC<RegisterFormProps> = ({ onSubmit, error, onDirty }) => {
  const {
    register,
    handleSubmit,
    formState: { errors, isValid, isSubmitting },
    watch,
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    mode: 'onChange', // validate on change to enable/disable submit immediately
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      password: '',
      confirmPassword: '',
      terms: false,
    },
  });
  const { ref } = useShake<HTMLFormElement>(error, isSubmitting);

  const watchedTerms = watch('terms');

  const submit = ({ firstName, lastName, email, password }: RegisterFormValues) =>
    onSubmit({ firstName, lastName, email, password });

  return (
    <form ref={ref} onSubmit={handleSubmit(submit)} onChange={onDirty} className="flex flex-col gap-4.5" noValidate>
      <div className="grid grid-cols-1 gap-4.5 sm:grid-cols-2 sm:gap-3">
        <Field label="First name" error={errors.firstName?.message}>
          {props => <Input {...props} {...register('firstName')} autoComplete="given-name" placeholder="Lucía" />}
        </Field>

        <Field label="Last name" error={errors.lastName?.message}>
          {props => <Input {...props} {...register('lastName')} autoComplete="family-name" placeholder="Ferreyra" />}
        </Field>
      </div>

      <Field label="Email address" error={errors.email?.message}>
        {props => (
          <Input {...props} {...register('email')} type="email" autoComplete="email" placeholder="you@company.com" />
        )}
      </Field>

      <Field label="Password" error={errors.password?.message}>
        {props => (
          <PasswordInput
            {...props}
            {...register('password')}
            autoComplete="new-password"
            placeholder="Create a strong password"
          />
        )}
      </Field>

      <Field label="Confirm password" error={errors.confirmPassword?.message}>
        {props => (
          <PasswordInput
            {...props}
            {...register('confirmPassword')}
            autoComplete="new-password"
            placeholder="Confirm your password"
            toggleLabel="confirm password"
          />
        )}
      </Field>

      <div>
        <div className="flex items-center gap-2.5">
          <input id="terms" type="checkbox" className="focus-ring size-4.5 cursor-pointer accent-accent" {...register('terms')} />
          <label htmlFor="terms" className="block cursor-pointer py-2 text-sm text-ink-secondary">
            I agree to the Terms of Service and the Privacy Policy
          </label>
        </div>
        {errors.terms?.message && (
          <p role="alert" className="mt-1.5 text-[13px] font-medium text-danger-strong">
            {errors.terms.message}
          </p>
        )}
      </div>

      {error && <AuthBanner>{error}</AuthBanner>}

      <Button type="submit" size="lg" isLoading={isSubmitting} disabled={!isValid || !watchedTerms} className="w-full">
        {isSubmitting ? (
          'Creating account...'
        ) : (
          <>
            Create account
            <Icon as={IconArrowRight} size={18} />
          </>
        )}
      </Button>
    </form>
  );
};

export default RegisterForm;
