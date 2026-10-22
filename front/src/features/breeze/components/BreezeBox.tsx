import { IconWind } from '@tabler/icons-react';
import { Icon, SegmentedControl } from '@/shared/ui';
import { BREEZE_KMH, BREEZE_LABEL, BREEZE_LEVELS, asBreezeLevel } from '../breeze';
import { useBreeze } from '../useBreeze';

const OPTIONS = BREEZE_LEVELS.map(level => ({ id: level, label: BREEZE_LABEL[level] }));

/**
 * The Breeze control: how much ambient wind the interface plays.
 *
 * It shows the person's own choice, always. When the system asks for reduced
 * motion the wind is held at still whatever the choice is, and the control says
 * so in two places, the speed hint, which reads "Reduced motion" and not a
 * speed, and the group's name, which a screen reader announces. The choice
 * itself stays selected and can still be changed: it is the setting that
 * applies on every other device, and the preference is not theirs to edit.
 */
export const BreezeBox = () => {
  const { stored, level, reducedBySystem, setLevel } = useBreeze();

  return (
    <div className="rounded-card border border-line-05 bg-surface/70 p-2.5">
      <div className="mb-2 flex items-center justify-between gap-2 px-0.5">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-ink">
          <Icon as={IconWind} size={16} className="text-accent" />
          Breeze
        </span>
        <span className="font-mono text-[11px] text-ink-tertiary">
          {reducedBySystem ? 'Reduced motion' : `${BREEZE_KMH[level]} km/h`}
        </span>
      </div>

      <SegmentedControl
        size="xs"
        label={reducedBySystem ? 'Breeze, held still because your system asks for reduced motion' : 'Breeze'}
        options={OPTIONS}
        value={stored}
        onChange={id => setLevel(asBreezeLevel(id))}
        className="flex w-full"
      />
    </div>
  );
};

export default BreezeBox;
