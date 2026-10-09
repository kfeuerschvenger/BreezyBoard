import React from 'react';
import { IconCalendar, IconListCheck } from '@tabler/icons-react';
import { useSignedOutBreeze } from '@/features/breeze';
import { Chip, Cover, Icon, WindLayer } from '@/shared/ui';
import { LogoGlyph, Wordmark } from './shell/BrandMark';

/**
 * The postcard, a task card and a sticky note, drawn as a still life of the
 * product. It is a picture, not content: every word on it is invented, so the
 * whole composition is hidden from assistive technology.
 *
 * The postcard shows its gradient until a photograph exists. The two cards
 * float on their own periods unless `float` is off, which is the still level:
 * it drops the animation class, so the cards rest whatever the stylesheet does.
 */
const StillLife: React.FC<{ float: boolean }> = ({ float }) => (
  <div aria-hidden="true" className="relative h-80">
    <div className="absolute right-[2%] top-0 h-75 w-62.5 rotate-6 rounded-float bg-surface p-2 pb-8.5 shadow-postcard">
      <div className="relative size-full">
        <Cover hue="sky" className="size-full rounded-control" />
      </div>
      <div className="absolute inset-x-3.5 bottom-2.5 flex justify-between font-mono text-[10.5px] tracking-[0.08em] text-ink-secondary">
        <span>EL CHALTÉN</span>
        <span>05:40 · 62 KM/H</span>
      </div>
    </div>

    <div className="absolute left-0 top-5 -rotate-5">
      <div
        className={`flex w-62.5 ${float ? 'animate-bb-float-a' : ''} flex-col gap-2.5 rounded-float bg-surface px-4 py-3.5 text-ink shadow-float`}
      >
        <div className="flex gap-1.5">
          <Chip hue="teal">Trip</Chip>
        </div>
        <div className="text-[15px] font-semibold leading-[1.35]">Check the wind forecast (again)</div>
        <div className="flex items-center gap-2 text-xs">
          <Chip hue="sand" variant="status" icon={<Icon as={IconCalendar} size={13} />}>
            Today
          </Chip>
          <span className="flex items-center gap-1 text-ink-secondary">
            <Icon as={IconListCheck} size={13} />
            2/3
          </span>
        </div>
      </div>
    </div>

    <div className="absolute left-[16%] top-42.5 rotate-3">
      <div
        className={`w-57.5 ${float ? 'animate-bb-float-b' : ''} rounded-note bg-note-sand px-4.5 py-4 text-ink shadow-float`}
      >
        <div className="mb-1.5 font-heading text-[17px] font-[650]">Note to self</div>
        <div className="text-sm leading-normal text-ink-body">
          You don't fight the wind here. You lean into it and keep walking.
        </div>
      </div>
    </div>
  </div>
);

/**
 * The branding column beside the sign in and sign up forms.
 *
 * It is hidden below the large breakpoint with `hidden`, which removes it from
 * the accessibility tree as well as the screen, so a phone gets the form and a
 * small wordmark and nothing else.
 *
 * The headline is a paragraph. The form column owns the page's one `h1`, and a
 * second one here would give a screen reader two titles for one page at every
 * width where this column is on screen.
 */
export const AuthBrandPanel: React.FC = () => {
  const { level } = useSignedOutBreeze();

  return (
    <aside
      aria-label="About BreezyBoard"
      data-breeze={level}
      className="relative m-3.5 hidden min-h-[min(800px,calc(100vh_-_28px))] flex-col justify-between gap-7 overflow-hidden rounded-stage bg-[image:var(--gradient-brand-panel)] pb-10 pl-11 pr-11 pt-9 text-white lg:flex"
    >
      <WindLayer tone="light" level={level} />

      <div className="relative flex items-center gap-2.5">
        <span className="flex size-9 items-center justify-center rounded-control border border-white/25 bg-white/15">
          <LogoGlyph size={22} />
        </span>
        <Wordmark className="text-[22px]" />
      </div>

      <StillLife float={level !== 'still'} />

      <div className="relative flex max-w-[560px] flex-col gap-4.5">
        <p className="font-heading text-[clamp(44px,5vw,66px)] font-bold leading-[0.98] tracking-[-0.035em] text-balance">
          Organize at the speed of{' '}
          <span className="bg-[image:var(--gradient-wind-word)] bg-clip-text text-transparent">wind.</span>
        </p>
        <p className="max-w-[460px] text-[17px] leading-[1.55] text-white text-pretty">
          Boards and notes that keep up with you. Quick to capture, effortless to move, light enough to carry anywhere.
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-white">
          <span className="rounded-pill border border-white/30 px-2.5 py-1 font-mono text-[11.5px] tracking-[0.08em]">
            MADE IN PATAGONIA · 50°20′S
          </span>
          <span>Built where the wind never takes a day off.</span>
        </div>
      </div>
    </aside>
  );
};

export default AuthBrandPanel;
