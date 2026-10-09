import { Link } from 'react-router-dom';

/** The three wind swirls of the logo, drawn on a 24 pixel grid in the current text colour. */
export const LogoGlyph = ({ size = 21, className = '' }: { size?: number; className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    aria-hidden="true"
    className={className}
  >
    <path d="M3 9h10a3 3 0 1 0-3-3" />
    <path d="M3 13.5h15a3 3 0 1 1-3 3" />
    <path d="M3 18h6" />
  </svg>
);

/**
 * "breezy" in the heavy weight and "board" in the regular one: the wordmark on
 * its own, for the places that set it beside a tile of their own. The size and
 * colour come from the caller.
 */
export const Wordmark = ({ className = '' }: { className?: string }) => (
  <span className={`font-heading leading-none tracking-[-0.03em] ${className}`}>
    <span className="font-extrabold">breezy</span>
    <span className="font-normal">board</span>
  </span>
);

export interface BrandMarkProps {
  /** Whether the glyph sways. It follows the Breeze setting, so a still sky stops it. */
  sway?: boolean;
  /** Runs when the link is followed, for a panel that closes when a destination is chosen. */
  onNavigate?: () => void;
}

/**
 * The logo tile and the wordmark, as one link to the home page.
 *
 * "breezy" is set in the heavy weight and "board" in the regular one, which is
 * the whole wordmark. The tile carries the logo gradient of the reference
 * design. White on its light end is about 2.2:1, which a logo is exempt from,
 * and the link's name is the wordmark's own text, so nothing depends on the
 * glyph being read.
 */
export const BrandMark = ({ sway = false, onNavigate }: BrandMarkProps) => (
  <Link
    to="/"
    onClick={onNavigate}
    className="focus-ring -ml-1 flex min-h-11 items-center gap-2.5 rounded-control px-1 lg:min-h-9"
  >
    <span className="flex size-9 shrink-0 items-center justify-center rounded-control bg-[image:var(--gradient-logo)] text-white shadow-logo">
      <LogoGlyph className={sway ? 'animate-bb-sway' : ''} />
    </span>
    <Wordmark className="text-[21px] text-ink" />
  </Link>
);

export default BrandMark;
