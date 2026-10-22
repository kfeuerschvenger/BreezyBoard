import React, { useState } from 'react';
import { coverGradient } from './hue';
import type { Hue } from './hue';

export interface CoverProps {
  hue?: Hue;
  /** The stored image. Without one, or when it fails to load, the gradient shows. */
  src?: string;
  /**
   * What the picture shows. Left out, the cover is decoration and is hidden
   * from assistive technology, which is right for almost every use: it sits
   * above a heading that already names the board or the person.
   */
  alt?: string;
  className?: string;
  /** Decorative overlay such as a wave line or a stack of avatars. Not read as part of an `alt`. */
  children?: React.ReactNode;
}

/**
 * A picture with the hue gradient behind it.
 *
 * The gradient is the cover until an image exists, and again if the image
 * fails, so a broken link or a slow connection never leaves an empty box. The
 * caller sizes it with `className`; it fills whatever it is given.
 *
 * With `alt` the cover is an image with that name. The inner `img` carries no
 * name of its own, so one picture is never announced twice.
 */
export const Cover: React.FC<CoverProps> = ({ hue = 'sky', src, alt = '', className = '', children }) => {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = Boolean(src) && failedSrc !== src;
  const semantics = alt ? ({ role: 'img', 'aria-label': alt } as const) : ({ 'aria-hidden': true } as const);

  return (
    <div {...semantics} className={`relative overflow-hidden ${className}`} style={{ background: coverGradient(hue) }}>
      {showImage && (
        <img
          src={src}
          alt=""
          loading="lazy"
          draggable={false}
          onError={() => setFailedSrc(src ?? null)}
          className="absolute inset-0 size-full object-cover"
        />
      )}
      {children}
    </div>
  );
};

export default Cover;
