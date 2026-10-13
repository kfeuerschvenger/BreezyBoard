import React from 'react';
import { IconLayoutKanban } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import { useBreeze } from '@/features/breeze';
import type { DashboardStats } from '@/models';
import { Cover, Icon, WindLayer } from '@/shared/ui';
import { BoardStats } from './BoardStats';

export interface HomeHeroProps {
  /** The eyebrow above the greeting, already formatted. */
  eyebrow: string;
  /** The page's one `h1`. */
  greeting: string;
  /** The sentence under it. */
  line: string;
  stats: DashboardStats;
  /** The board the main button opens, when there is one. */
  firstBoard?: { _id: string; title: string };
}

/**
 * The introduction at the top of the home page: the date, the greeting, the
 * totals and the way back into the board that was worked on last.
 *
 * It is a `header` inside the page's `main`, which makes it a sectioning
 * header and not a second banner landmark, as the page header of the other
 * views is. Every word on it is white on a gradient that stays dark under the
 * text: the lightest stop is darker than the reference design's, because white
 * on the reference's lightest stop measures 2.2:1. The photo frame is a picture
 * of the view outside, drawn as its gradient until real photographs exist, and
 * it is decoration.
 *
 * The wind layer plays the level of the Breeze setting, so Still takes it
 * away with the rest of the ambient motion. Its streaks are translucent white
 * and pass behind the text now and then; the text contrast is measured with
 * the wind absent, as it is on the auth screen.
 */
export const HomeHero: React.FC<HomeHeroProps> = ({ eyebrow, greeting, line, stats, firstBoard }) => {
  const { level } = useBreeze();

  return (
    <header className="relative flex min-h-60 flex-wrap items-center justify-between gap-7 overflow-hidden rounded-hero bg-[image:var(--gradient-hero)] px-6 py-8 text-white shadow-hero sm:px-10 sm:py-[34px]">
      <WindLayer tone="light" level={level} />

      <div className="relative flex min-w-0 max-w-150 flex-1 basis-85 flex-col gap-4">
        <p className="self-start font-mono text-xs tracking-[0.12em] text-white">{eyebrow}</p>
        <h1 className="font-heading text-[clamp(36px,4vw,52px)] font-bold leading-none tracking-[-0.035em] text-balance">
          {greeting}
        </h1>
        <p className="text-base leading-normal text-white">{line}</p>

        <BoardStats stats={stats} />

        {firstBoard && (
          <div className="mt-1 flex min-w-0">
            <Link
              to={`/board/${firstBoard._id}`}
              className="focus-ring-on-ink inline-flex h-[42px] min-w-0 max-w-full items-center gap-2 rounded-control bg-surface px-4 text-sm font-semibold text-ink transition-[translate,box-shadow] duration-200 ease-standard hover:-translate-y-0.5 hover:shadow-button-hover"
            >
              <Icon as={IconLayoutKanban} size={18} />
              <span className="truncate" title={`Open ${firstBoard.title}`}>
                Open {firstBoard.title}
              </span>
            </Link>
          </div>
        )}
      </div>

      <div aria-hidden="true" className="relative h-41 w-60 shrink-0 rotate-3 rounded-float bg-surface/90 p-1.5">
        <Cover hue="sky" className="size-full rounded-[13px]" />
      </div>
    </header>
  );
};

export default HomeHero;
