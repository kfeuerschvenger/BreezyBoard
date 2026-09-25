import React from 'react';
import { Camera } from 'lucide-react';

export interface AvatarUploaderProps {
  /** The stored image, when there is one. */
  avatarUrl?: string;
  /** Shown in its place when there is not. */
  initials: string;
  onFileSelected: (file: File) => void;
}

/**
 * The avatar, with the control that replaces it.
 *
 * The file input is hidden with `sr-only` rather than with `hidden`, which
 * compiles to `display:none` and takes a control out of the focus order
 * altogether. It did, so changing an avatar was mouse-only. Finding P4-11.
 *
 * The name is on the input rather than on the label drawn around it, because
 * the input is the control; the focus ring is on the label, because the label
 * is what is drawn.
 */
export const AvatarUploader: React.FC<AvatarUploaderProps> = ({ avatarUrl, initials, onFileSelected }) => {
  const onChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) onFileSelected(file);
  };

  return (
    <div className="relative inline-block">
      <div className="w-24 h-24 bg-blue-600 rounded-full flex items-center justify-center text-white text-2xl font-bold mx-auto mb-4 overflow-hidden">
        {avatarUrl ? (
          <img src={avatarUrl} alt="Profile" className="w-full h-full object-cover" />
        ) : (
          <span>{initials}</span>
        )}
      </div>

      <label className="absolute -bottom-0 -right-0 translate-x-1/4 translate-y-1/4 bg-white border-2 border-gray-200 rounded-full p-2 cursor-pointer hover:bg-gray-50 transition-colors focus-within:outline-none focus-within:ring-2 focus-within:ring-blue-500">
        <Camera size={16} className="text-gray-600" aria-hidden="true" />
        <input type="file" accept="image/*" aria-label="Change avatar" onChange={onChange} className="sr-only" />
      </label>
    </div>
  );
};

export default AvatarUploader;
