import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';

import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

import { Mail, Lock, User } from 'lucide-react';
import { motion } from 'framer-motion';

import { Field, Input, PasswordInput } from '@/shared/ui';
import LegalModal from '@/components/LegalModal';
import { useAuth } from '@/hooks/useAuth';
import type { RegisterCredentials } from '@/models';

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

const RegisterForm: React.FC = () => {
  const navigate = useNavigate();
  const { register: authRegister } = useAuth(); // rename to avoid conflict with react-hook-form's register
  const [openModal, setOpenModal] = useState<'terms' | 'privacy' | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  // react-hook-form setup
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

  const watchedTerms = watch('terms');

  const onSubmit = async (values: RegisterFormValues) => {
    setApiError(null);
    try {
      const payload: RegisterCredentials = {
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        password: values.password,
      };

      await authRegister(payload);
      navigate('/');
    } catch (err) {
      console.error('Registration failed:', err);
      setApiError('Registration failed. Please try again.');
    }
  };

  // modal helpers
  const openTerms = () => setOpenModal('terms');
  const openPrivacy = () => setOpenModal('privacy');
  const closeModal = () => setOpenModal(null);

  return (
    <>
      {apiError && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{apiError}</div>}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="First name" error={errors.firstName?.message} icon={<User className="h-5 w-5 text-gray-400" />}>
            {props => <Input {...props} {...register('firstName')} placeholder="John" className="pl-10" />}
          </Field>

          <Field label="Last name" error={errors.lastName?.message} icon={<User className="h-5 w-5 text-gray-400" />}>
            {props => <Input {...props} {...register('lastName')} placeholder="Doe" className="pl-10" />}
          </Field>
        </div>

        <Field label="Email address" error={errors.email?.message} icon={<Mail className="h-5 w-5 text-gray-400" />}>
          {props => (
            <Input {...props} {...register('email')} type="email" placeholder="john@example.com" className="pl-10" />
          )}
        </Field>

        <Field label="Password" error={errors.password?.message}>
          {props => (
            <PasswordInput
              {...props}
              {...register('password')}
              placeholder="Create a strong password"
              icon={<Lock className="h-5 w-5 text-gray-400" />}
              toggleLabel="password"
            />
          )}
        </Field>

        <Field label="Confirm password" error={errors.confirmPassword?.message}>
          {props => (
            <PasswordInput
              {...props}
              {...register('confirmPassword')}
              placeholder="Confirm your password"
              icon={<Lock className="h-5 w-5 text-gray-400" />}
              toggleLabel="confirm password"
            />
          )}
        </Field>

        <div className="flex items-center">
          <input
            id="terms"
            type="checkbox"
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            {...register('terms')}
          />
          <label htmlFor="terms" className="ml-2 block py-2 text-sm text-gray-700">
            I agree to the{' '}
            <button
              type="button"
              onClick={openTerms}
              onMouseEnter={() => fetch(encodeURI('/terms-of-service.txt')).catch(() => {})}
              className="text-blue-600 hover:text-blue-500 font-medium underline cursor-pointer"
            >
              Terms of Service
            </button>{' '}
            and{' '}
            <button
              type="button"
              onClick={openPrivacy}
              onMouseEnter={() => fetch(encodeURI('/privacy-policy.txt')).catch(() => {})}
              className="text-blue-600 hover:text-blue-500 font-medium underline cursor-pointer"
            >
              Privacy Policy
            </button>
          </label>
        </div>
        {errors.terms?.message && <p className="mt-1 text-sm text-red-600">{errors.terms?.message}</p>}

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          type="submit"
          disabled={!isValid || !watchedTerms || isSubmitting}
          className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer"
        >
          {isSubmitting ? 'Creating account...' : 'Create account'}
        </motion.button>
      </form>

      <div className="mt-6 text-center">
        <p className="text-gray-600">
          Already have an account?{' '}
          <Link to="/login" className="text-blue-600 hover:text-blue-500 font-medium">
            Sign in
          </Link>
        </p>
      </div>

      {/* Legal modals */}
      <LegalModal
        open={openModal === 'terms'}
        onClose={closeModal}
        title="Terms of Service - BreezyBoard"
        filePath="/terms-of-service.txt"
      />
      <LegalModal
        open={openModal === 'privacy'}
        onClose={closeModal}
        title="Privacy Policy - BreezyBoard"
        filePath="/privacy-policy.txt"
      />
    </>
  );
};

export default RegisterForm;
