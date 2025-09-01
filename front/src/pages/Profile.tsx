import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Calendar, Camera, Mail, MapPin, Save, User } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import FormInput from '@/components/FormInput';
import SuccessModal from '@/components/SuccessModal';
import { useAuth } from '@/hooks/useAuth';
import { UserService } from '@/services';
import type { User as UserModel } from '@/models';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

/**
 * Schema for profile form using zod.
 * - firstName and lastName required
 * - email must be a valid email
 * - other fields optional
 */
const profileSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Email is invalid'),
  location: z.string().optional().or(z.literal('')),
  role: z.string().optional().or(z.literal('')),
  department: z.string().optional().or(z.literal('')),
  avatar: z.string().optional().or(z.literal('')),
  createdAt: z.string().optional().or(z.literal('')), // for display only
});

type ProfileFormValues = z.infer<typeof profileSchema>;

const ProfilePage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth(); // expects the auth hook to expose current user (with _id)
  const userId = user?._id ?? null;

  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);

  // file input ref to trigger file dialog programmatically
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // react-hook-form setup
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty, isValid, isSubmitting },
    watch,
    setValue,
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    mode: 'onChange',
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      location: '',
      role: '',
      department: '',
      avatar: '',
      createdAt: '',
    },
  });

  // fetch profile on mount (or when userId becomes available)
  useEffect(() => {
    if (!userId) {
      setLoading(false);
      setApiError('User not found in auth context.');
      return;
    }

    let mounted = true;
    const load = async () => {
      setLoading(true);
      try {
        const data: UserModel = await UserService.getById(userId);
        if (!mounted) return;

        // normalize and set fields expected by the form
        const defaultValues: ProfileFormValues = {
          firstName: data.firstName ?? '',
          lastName: data.lastName ?? '',
          email: data.email ?? '',
          location: data.location ?? '',
          role: data.role ?? '',
          department: data.department ?? '',
          avatar: data.avatar ?? '',
          createdAt: data.createdAt ?? '',
        };

        reset(defaultValues, { keepDirty: false });
        setApiError(null);
      } catch (err) {
        console.error('Failed to load profile:', err);
        setApiError('Failed to load profile. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, [userId, reset]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  // handle avatar selection and upload
  const onAvatarSelected = async (file?: File | null) => {
    if (!file || !userId) return;
    setAvatarUploading(true);
    setApiError(null);

    try {
      // upload to the server and get the new avatar URL
      const avatarUrl = await UserService.uploadAvatar(userId, file);
      // update form value with new avatar
      setValue('avatar', avatarUrl, { shouldDirty: true, shouldValidate: true });
    } catch (err) {
      console.error('Avatar upload failed:', err);
      setApiError('Avatar upload failed. Please try again.');
    } finally {
      setAvatarUploading(false);
    }
  };

  const onAvatarInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    onAvatarSelected(file);
  };

  // Save profile handler
  const onSave = async (values: ProfileFormValues) => {
    if (!userId) {
      setApiError('User not available.');
      return;
    }
    setApiError(null);
    try {
      // send only allowed fields
      const payload: Partial<UserModel> = {
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        location: values.location,
        role: values.role,
        department: values.department,
        avatar: values.avatar,
      };

      await UserService.update(userId, payload);
      // reset form state to reflect that changes were saved
      reset(values, { keepDirty: false });
      setSuccessOpen(true);
    } catch (err) {
      console.error('Failed to update profile:', err);
      setApiError('Failed to update profile. Please try again.');
    }
  };

  const onCancel = () => {
    // reload original values from server (safer) or reset to last known values
    if (!userId) return;
    // simplest: re-fetch (could be optimized)
    (async () => {
      setLoading(true);
      try {
        const data = await UserService.getById(userId);
        reset(
          {
            firstName: data.firstName ?? '',
            lastName: data.lastName ?? '',
            email: data.email ?? '',
            location: data.location ?? '',
            role: data.role ?? '',
            department: data.department ?? '',
            avatar: data.avatar ?? '',
          },
          { keepDirty: false }
        );
      } catch (err) {
        console.error('Cancel: failed to reload profile', err);
        setApiError('Failed to reload profile.');
      } finally {
        setLoading(false);
      }
    })();
  };

  const avatarValue = watch('avatar');

  return (
    <div className="min-h-screen bg-gray-50">
      <PageHeader
        title="Profile Settings"
        subtitle="Manage your account information and preferences"
        showBackButton
        onBack={() => navigate('/')}
      >
        {/* Show actions only when there are unsaved changes */}
        {!loading && isDirty && (
          <div className="flex items-center gap-3">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              Cancel
            </button>

            <button
              onClick={handleSubmit(onSave)}
              disabled={!isValid || isSubmitting}
              className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-all duration-200 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isSubmitting ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Save size={16} />
              )}
              <span className="md:hidden">{isSubmitting ? 'Saving...' : 'Save'}</span>
              <span className="hidden md:inline">{isSubmitting ? 'Saving...' : 'Save Changes'}</span>
            </button>
          </div>
        )}
      </PageHeader>

      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Profile Card */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="text-center mb-6">
                <div className="relative inline-block">
                  <div className="w-24 h-24 bg-blue-600 rounded-full flex items-center justify-center text-white text-2xl font-bold mx-auto mb-4 overflow-hidden">
                    {avatarValue ? (
                      // avatarValue is expected to be a URL
                      <img src={avatarValue} alt="Profile" className="w-full h-full object-cover" />
                    ) : (
                      <span>{(watch('firstName')?.charAt(0) ?? '') + (watch('lastName')?.charAt(0) ?? '')}</span>
                    )}
                  </div>

                  {/* Camera upload button */}
                  <label
                    className="absolute -bottom-0 -right-0 translate-x-1/4 translate-y-1/4 bg-white border-2 border-gray-200 rounded-full p-2 cursor-pointer hover:bg-gray-50 transition-colors"
                    aria-label="Change avatar"
                  >
                    <Camera size={16} className="text-gray-600" />
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={onAvatarInputChange}
                      className="hidden"
                    />
                  </label>
                </div>

                <h2 className="text-xl font-bold text-gray-900 font-heading">
                  {watch('firstName')} {watch('lastName')}
                </h2>
                <p className="text-gray-600 font-body">{watch('role')}</p>
                <p className="text-sm text-gray-500">{watch('department')}</p>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-3 text-sm">
                  <Calendar size={16} className="text-gray-400" />
                  <span className="text-gray-600">Joined {formatDate(watch('createdAt') || '')}</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <MapPin size={16} className="text-gray-400" />
                  <span className="text-gray-600">{watch('location') || 'Unknown'}</span>
                </div>
                {avatarUploading && <div className="text-sm text-gray-500">Uploading avatar…</div>}
              </div>
            </div>
          </motion.div>

          {/* Profile Form */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="lg:col-span-2"
          >
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-lg font-semibold text-gray-900 font-heading mb-6">Personal Information</h3>

              <form className="space-y-6" onSubmit={handleSubmit(onSave)}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <FormInput
                      label="First Name"
                      placeholder="Enter first name"
                      {...register('firstName')}
                      icon={<User size={16} className="text-gray-400" />}
                      error={errors.firstName?.message as string | undefined}
                    />
                  </div>
                  <div>
                    <FormInput
                      label="Last Name"
                      placeholder="Enter last name"
                      {...register('lastName')}
                      icon={<User size={16} className="text-gray-400" />}
                      error={errors.lastName?.message as string | undefined}
                    />
                  </div>
                </div>

                <div>
                  <FormInput
                    label="Email Address"
                    placeholder="Enter email address"
                    type="email"
                    {...register('email')}
                    icon={<Mail size={16} className="text-gray-400" />}
                    error={errors.email?.message as string | undefined}
                  />
                </div>

                <div>
                  <FormInput
                    label="Location"
                    placeholder="Enter location"
                    {...register('location')}
                    icon={<MapPin size={16} className="text-gray-400" />}
                    error={errors.location?.message as string | undefined}
                  />
                </div>

                <div>
                  <FormInput
                    label="Role"
                    placeholder="Enter your role"
                    {...register('role')}
                    error={errors.role?.message as string | undefined}
                  />
                </div>

                <div>
                  <FormInput
                    label="Department"
                    placeholder="Enter department"
                    {...register('department')}
                    error={errors.department?.message as string | undefined}
                  />
                </div>

                {/* Show API error if any */}
                {apiError && <div className="text-sm text-red-600">{apiError}</div>}

                {/* Inline actions at bottom of form for mobile */}
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={onCancel}
                    className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    disabled={isSubmitting || !isDirty}
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={!isValid || !isDirty || isSubmitting}
                    className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-all duration-200 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {isSubmitting ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Save size={16} />
                    )}
                    <span className="md:hidden">{isSubmitting ? 'Saving...' : 'Save'}</span>
                    <span className="hidden md:inline">{isSubmitting ? 'Saving...' : 'Save Changes'}</span>
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </div>
      </div>
      {/* Success modal shown after saving changes */}
      <SuccessModal
        open={successOpen}
        onClose={() => setSuccessOpen(false)}
        title="Profile saved"
        message="Your profile has been updated successfully."
        autoCloseMs={2000} // auto-close after 2s; set to 0 to disable
      />
    </div>
  );
};

export default ProfilePage;
