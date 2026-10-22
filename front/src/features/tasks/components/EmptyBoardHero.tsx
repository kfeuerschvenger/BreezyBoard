import React from 'react';
import { IconPlus, IconWind } from '@tabler/icons-react';
import { Button, Cover, Icon } from '@/shared/ui';
import type { Hue } from '@/shared/ui';

export interface EmptyBoardHeroProps {
  hue: Hue;
  /** Opens the first column's composer, the same thing the board header's button does. */
  onAddFirstCard: () => void;
}

/**
 * What a board with no card at all shows above its columns.
 *
 * It sits above the row and not inside a column: it describes the whole board,
 * it never covers a drop target, and it is the same shape at 390 and 1440
 * pixels. The columns and their "Still air" hints stay on screen beneath it.
 *
 * The picture is the board's own gradient with the wind glyph, until the
 * illustration the design calls for exists. It is decoration, so it is not
 * announced and it is dropped below the small breakpoint, where the room is
 * better spent on the columns.
 */
export const EmptyBoardHero: React.FC<EmptyBoardHeroProps> = ({ hue, onAddFirstCard }) => (
  <section
    data-empty-board
    className="mx-4 mb-4 flex shrink-0 animate-bb-hero flex-wrap items-center gap-x-6 gap-y-3 rounded-modal border border-glass-border bg-glass-banner p-4 backdrop-blur-[14px] sm:mx-6 sm:pr-6"
  >
    <Cover hue={hue} className="hidden h-[150px] w-60 shrink-0 rounded-float sm:block">
      <Icon as={IconWind} size={56} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white" />
    </Cover>

    <div className="min-w-0 flex-1 basis-60">
      <h2 className="font-heading text-[22px] font-bold tracking-tight text-ink">A fresh board. The wind&apos;s at your back.</h2>
      <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-ink-secondary">
        Toss your first card into a column. Press Enter to keep adding, no clicks needed.
      </p>
    </div>

    <Button type="button" size="sm" onClick={onAddFirstCard} leftIcon={<Icon as={IconPlus} size={18} />}>
      Add your first card
    </Button>
  </section>
);

export default EmptyBoardHero;
