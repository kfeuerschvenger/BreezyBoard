import React, { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Mail } from 'lucide-react';
import { Button, Field, Input, Modal } from '@/shared/ui';
import { httpStatusOf } from '@/shared/lib/httpStatus';

const forgotPasswordSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Email is invalid'),
});

type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;

export interface ForgotPasswordModalProps {
  open: boolean;
  onClose: () => void;
  /** Asks for a reset link. Rejects only when the request itself failed, never because of the address. */
  onSubmit: (email: string) => Promise<void>;
}

/**
 * Asks for the email address and requests a reset link.
 *
 * The confirmation is the same for every address that was accepted, and it
 * is worded as a conditional on purpose: the server answers identically
 * whether or not an account exists, so this dialog has nothing it could say
 * about that and must not imply it does.
 *
 * The form and the confirmation replace one another inside the same dialog,
 * so the control that had focus is removed from the page. Focus moves to the
 * confirmation's Done button at that moment, which is also what a screen
 * reader announces next, rather than being dropped on the document.
 */
export const ForgotPasswordModal: React.FC<ForgotPasswordModalProps> = ({ open, onClose, onSubmit }) => {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    mode: 'onSubmit',
    defaultValues: { email: '' },
  });

  // Reopening starts from an empty form, not from the last confirmation.
  useEffect(() => {
    if (!open) {
      setSentTo(null);
      setFailure(null);
      reset();
    }
  }, [open, reset]);

  useEffect(() => {
    if (sentTo) {
      closeRef.current?.focus();
    }
  }, [sentTo]);

  const submit = async ({ email }: ForgotPasswordValues) => {
    setFailure(null);

    try {
      await onSubmit(email);
      setSentTo(email);
    } catch (error) {
      setFailure(
        httpStatusOf(error) === 429
          ? 'Too many requests. Please wait a few minutes before trying again.'
          : 'We could not send the request. Please try again.'
      );
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Forgot password" size="sm">
      {sentTo ? (
        <div className="space-y-6">
          <p role="status" className="text-gray-600">
            If an account exists for <strong className="break-all text-gray-900">{sentTo}</strong>, we have sent a link to
            reset its password. The link works once and expires soon.
          </p>
          <div className="flex justify-end">
            <Button ref={closeRef} type="button" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit(submit)} className="space-y-6" noValidate>
          <p className="text-gray-600">Enter the email address of your account and we will send you a link to choose a new password.</p>

          {failure && (
            <div role="alert" className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">
              {failure}
            </div>
          )}

          <Field label="Email address" error={errors.email?.message} icon={<Mail className="h-5 w-5 text-gray-400" />}>
            {props => (
              <Input
                {...props}
                {...register('email')}
                type="email"
                autoComplete="email"
                placeholder="Enter your email"
                className="pl-10"
              />
            )}
          </Field>

          <div className="flex flex-wrap justify-end gap-3">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSubmitting}>
              {isSubmitting ? 'Sending...' : 'Send reset link'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
};

export default ForgotPasswordModal;
