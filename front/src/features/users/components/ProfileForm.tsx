import React from 'react';
import { motion } from 'framer-motion';
import { Mail, MapPin, User } from 'lucide-react';
import type { UseFormReturn } from 'react-hook-form';
import FormInput from '@/components/FormInput';
import type { ProfileFormValues } from '../hooks/useProfile';
import { ProfileActions } from './ProfileActions';

export interface ProfileFormProps {
  form: UseFormReturn<ProfileFormValues>;
  /** The one message worth showing, whether the read or a write produced it. */
  error: string | null;
  onSubmit: React.FormEventHandler<HTMLFormElement>;
  onCancel: () => void;
}

/** The editable fields, in the order the form asks for them. */
const FIELDS = [
  { name: 'email', label: 'Email Address', placeholder: 'Enter email address', type: 'email', icon: <Mail size={16} className="text-gray-400" /> },
  { name: 'location', label: 'Location', placeholder: 'Enter location', icon: <MapPin size={16} className="text-gray-400" /> },
  { name: 'role', label: 'Role', placeholder: 'Enter your role' },
  { name: 'department', label: 'Department', placeholder: 'Enter department' },
] as const;

export const ProfileForm: React.FC<ProfileFormProps> = ({ form, error, onSubmit, onCancel }) => {
  const {
    register,
    formState: { errors, isDirty, isValid, isSubmitting },
  } = form;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="lg:col-span-2"
    >
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-gray-900 font-heading mb-6">Personal Information</h3>

        <form className="space-y-6" onSubmit={onSubmit}>
          {/* The two names sit side by side; everything below is full width. */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormInput
              label="First Name"
              placeholder="Enter first name"
              {...register('firstName')}
              icon={<User size={16} className="text-gray-400" />}
              error={errors.firstName?.message}
            />
            <FormInput
              label="Last Name"
              placeholder="Enter last name"
              {...register('lastName')}
              icon={<User size={16} className="text-gray-400" />}
              error={errors.lastName?.message}
            />
          </div>

          {FIELDS.map(field => (
            <FormInput
              key={field.name}
              label={field.label}
              placeholder={field.placeholder}
              type={'type' in field ? field.type : undefined}
              {...register(field.name)}
              icon={'icon' in field ? field.icon : undefined}
              error={errors[field.name]?.message}
            />
          ))}

          {error && <div className="text-sm text-red-600">{error}</div>}

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
            <ProfileActions isDirty={isDirty} isValid={isValid} isSubmitting={isSubmitting} onCancel={onCancel} />
          </div>
        </form>
      </div>
    </motion.div>
  );
};

export default ProfileForm;
