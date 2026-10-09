import React, { useMemo } from 'react';
import { hueFromSeed, MID_BACKGROUND } from './hue';
import type { Hue } from './hue';

export type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';

/** `surface` is the white ring of an avatar on a card, `ground` the page-coloured ring of one on the page. */
export type AvatarRing = 'none' | 'surface' | 'ground';

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
  /**
   * Picks the fill. Pass the user's id where there is one: a name can change
   * and the colour a person has been seen in should not. Without it the name
   * is the seed.
   */
  seed?: string;
  /** Sets the fill directly, for the one place that needs a particular hue. */
  hue?: Hue;
  /** A ring that separates one avatar from the next where they overlap. */
  ring?: AvatarRing;
  className?: string;
}

const SIZE_CLASSES: Record<AvatarSize, string> = {
  sm: 'w-6 h-6 text-[10px]',
  md: 'w-8 h-8 text-xs',
  lg: 'w-12 h-12 text-lg',
  xl: 'w-24 h-24 text-3xl font-heading',
};

const RING_CLASSES: Record<AvatarRing, string> = {
  none: '',
  surface: 'ring-2 ring-surface',
  ground: 'ring-[2.5px] ring-ground',
};

/**
 * The fill is the hue's mid step with ink initials on it. Ink on the six mid
 * steps measures 6.66 to 7.35:1, so the initials hold 4.5:1 at 10 pixels in
 * every hue. A tinted fill with a deep initial is not used because two of the
 * five hand-drawn avatars this replaced were grey on grey.
 */
const BASE_CLASSES = 'inline-flex items-center justify-center rounded-full overflow-hidden shrink-0 text-ink';

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
 * of in each of the five places that used to draw this by hand.
 *
 * The fill is chosen by the seed, so the same person is the same colour on
 * every screen and every device without anything being stored.
 */
export const Avatar: React.FC<AvatarProps> = ({
  name,
  src,
  size = 'md',
  decorative = false,
  seed,
  hue,
  ring = 'none',
  className = '',
}) => {
  const initials = useMemo(() => initialsOf(name), [name]);
  const label = name.trim() || 'Unknown user';
  const fill = hue ?? hueFromSeed(seed ?? name.trim().toLowerCase());

  const semantics = decorative
    ? ({ 'aria-hidden': true } as const)
    : ({ role: 'img', 'aria-label': label } as const);

  return (
    <div
      {...semantics}
      className={`${BASE_CLASSES} ${MID_BACKGROUND[fill]} ${SIZE_CLASSES[size]} ${RING_CLASSES[ring]} ${className}`}
    >
      {src ? (
        // The wrapper already carries the name, or is hidden outright, so the
        // image never needs one of its own.
        <img src={src} alt="" loading="lazy" draggable={false} className="w-full h-full object-cover" />
      ) : (
        <span className="font-bold select-none">{initials}</span>
      )}
    </div>
  );
};

export default Avatar;
