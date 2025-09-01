import React, { useMemo } from 'react';
import type { User } from '@/models';

export interface SimpleUserAvatarProps {
  user?: User | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /** If true, add a title attribute to show full name on hover */
  showTooltip?: boolean;
}

// Keep size-related classes outside the component to avoid recreating them on each render.
const SIZE_MAP: Record<NonNullable<SimpleUserAvatarProps['size']>, string> = {
  sm: 'w-6 h-6 text-xs',
  md: 'w-8 h-8 text-sm',
  lg: 'w-12 h-12 text-lg',
};

/**
 * SimpleUserAvatar
 * - Small, focused component that renders an avatar image or initials fallback.
 * - Accessible (role + aria-label) and supports optional tooltip and custom classes.
 */
const SimpleUserAvatar: React.FC<SimpleUserAvatarProps> = ({
  user = null,
  size = 'md',
  className = '',
  showTooltip = true,
}) => {
  // Compute initials and display name safely. Memoize to avoid recalculating on every render.
  const { initials, displayName, ariaLabel } = useMemo(() => {
    const first = user?.firstName?.trim() ?? '';
    const last = user?.lastName?.trim() ?? '';
    const firstInitial = first ? first[0].toUpperCase() : '';
    const lastInitial = last ? last[0].toUpperCase() : '';
    const initials = `${firstInitial}${lastInitial}` || '?';
    const displayName = user && (first || last) ? `${first}${first && last ? ' ' : ''}${last}` : 'Unknown user';
    const ariaLabel = user ? displayName : 'Unknown user';
    return { initials, displayName, ariaLabel };
  }, [user]);

  const sizeClasses = SIZE_MAP[size];
  const baseClasses = 'inline-flex items-center justify-center rounded-full overflow-hidden';

  // If no user provided, show a neutral placeholder.
  if (!user) {
    return (
      <div
        role="img"
        aria-label="Unknown user"
        title={showTooltip ? 'Unknown user' : undefined}
        className={`${baseClasses} bg-gray-200 text-gray-500 ${sizeClasses} ${className}`}
      >
        <span className="font-medium">{initials}</span>
      </div>
    );
  }

  // If user has an avatar URL, render the image (prefer image for visual fidelity).
  if (user.avatar) {
    return (
      <div
        role="img"
        aria-label={ariaLabel}
        title={showTooltip ? displayName : undefined}
        className={`${baseClasses} bg-blue-100 ${sizeClasses} ${className}`}
      >
        <img
          src={user.avatar}
          alt={ariaLabel}
          loading="lazy"
          className="w-full h-full object-cover"
          draggable={false}
        />
      </div>
    );
  }

  // Fallback: initials with a colored background.
  return (
    <div
      role="img"
      aria-label={ariaLabel}
      title={showTooltip ? displayName : undefined}
      className={`${baseClasses} bg-blue-100 text-blue-800 ${sizeClasses} ${className}`}
    >
      <span className="font-medium select-none">{initials}</span>
    </div>
  );
};

export default SimpleUserAvatar;
