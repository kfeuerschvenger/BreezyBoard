import React, { useMemo } from 'react';

export type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';

export interface AvatarProps {
  /** The whole name. Initials are taken from it, and it names the avatar. */
  name: string;
  /** The stored image, when there is one. */
  src?: string;
  size?: AvatarSize;
  /**
   * True when the name is already written next to it. The avatar is then
   * hidden from assistive technology rather than announcing the same name a
   * second time, which is what every hand-written copy of this did.
   */
  decorative?: boolean;
  className?: string;
}

const SIZE_CLASSES: Record<AvatarSize, string> = {
  sm: 'w-6 h-6 text-xs',
  md: 'w-8 h-8 text-sm',
  lg: 'w-12 h-12 text-lg',
  xl: 'w-24 h-24 text-2xl',
};

const BASE_CLASSES = 'inline-flex items-center justify-center rounded-full overflow-hidden shrink-0';

/** Up to two initials, or a question mark when there is no name to take them from. */
const initialsOf = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';

  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : '';
  return `${first}${last}`.toUpperCase();
};

/**
 * Somebody's picture, or their initials when there is none.
 *
 * It takes a name rather than a user, so it stays a shared primitive and does
 * not need to know what a user is. The initials rule lives here once instead
 * of in each of the five places that used to draw this by hand, two of which
 * put grey text on a grey circle.
 */
export const Avatar: React.FC<AvatarProps> = ({ name, src, size = 'md', decorative = false, className = '' }) => {
  const initials = useMemo(() => initialsOf(name), [name]);
  const label = name.trim() || 'Unknown user';

  const semantics = decorative
    ? ({ 'aria-hidden': true } as const)
    : ({ role: 'img', 'aria-label': label } as const);

  return (
    <div {...semantics} className={`${BASE_CLASSES} bg-blue-100 text-blue-800 ${SIZE_CLASSES[size]} ${className}`}>
      {src ? (
        // The wrapper already carries the name, or is hidden outright, so the
        // image never needs one of its own.
        <img src={src} alt="" loading="lazy" draggable={false} className="w-full h-full object-cover" />
      ) : (
        <span className="font-medium select-none">{initials}</span>
      )}
    </div>
  );
};

export default Avatar;
