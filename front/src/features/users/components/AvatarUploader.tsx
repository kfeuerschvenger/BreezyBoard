import React from 'react';
import { IconCamera } from '@tabler/icons-react';
import { Avatar, Icon } from '@/shared/ui';

export interface AvatarUploaderProps {
  /** The stored image, when there is one. */
  avatarUrl?: string;
  /** The whole name. The avatar takes its initials from it when there is no image. */
  name: string;
  /** Picks the avatar's colour. The user's id, so the colour does not follow a rename. */
  seed?: string;
  onFileSelected: (file: File) => void;
  className?: string;
}

/**
 * The avatar, with the control that replaces it.
 *
 * The file input is hidden with `sr-only` rather than with `hidden`, which
 * compiles to `display:none` and takes a control out of the focus order
 * altogether, so changing an avatar would be mouse-only. Finding P4-11.
 *
 * The name is on the input rather than on the label drawn around it, because
 * the input is the control; the focus ring is on the label, because the label
 * is what is drawn. The label is 44 pixels square, the target the responsive
 * gate requires on touch, and sits on the avatar's lower right edge.
 */
export const AvatarUploader: React.FC<AvatarUploaderProps> = ({
  avatarUrl,
  name,
  seed,
  onFileSelected,
  className = '',
}) => {
  const onChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) onFileSelected(file);
  };

  return (
    // `self-start` keeps the box as wide as the avatar inside a column flex
    // parent, which would otherwise stretch it and carry the camera button to
    // the far edge of the row.
    <div className={`relative inline-block self-start ${className}`}>
      {/*
        Decorative: the name is written directly beside this, and the control
        that changes the picture carries its own name.
      */}
      <Avatar
        name={name}
        src={avatarUrl}
        seed={seed}
        size="xl"
        decorative
        className="ring-[5px] ring-ground shadow-card"
      />

      <label className="focus-ring-within absolute bottom-0 right-0 inline-flex size-11 cursor-pointer items-center justify-center rounded-pill border border-line-12 bg-surface text-ink-secondary shadow-card transition-colors duration-200 hover:text-ink">
        <Icon as={IconCamera} size={18} aria-hidden="true" />
        <input type="file" accept="image/*" aria-label="Change avatar" onChange={onChange} className="sr-only" />
      </label>
    </div>
  );
};

export default AvatarUploader;
