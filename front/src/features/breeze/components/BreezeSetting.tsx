import { SegmentedControl } from '@/shared/ui';
import { BREEZE_KMH, BREEZE_LABEL, BREEZE_LEVELS, asBreezeLevel } from '../breeze';
import { useBreeze } from '../useBreeze';

const OPTIONS = BREEZE_LEVELS.map(level => ({ id: level, label: BREEZE_LABEL[level] }));

/**
 * The Breeze level as the profile offers it: the same four choices and the
 * same stored value as the sidebar's box, at the profile's size, with the
 * words the box has no room for.
 *
 * The line under the control says what the level does and answers the
 * question the setting raises: the cards on a board sway at Gusty and at no
 * other level, so any lower one stops them. A system that asks for reduced
 * motion holds the wind still whatever is chosen, and the line says that
 * instead; the choice stays selected and is the one that applies on every
 * other device.
 */
export const BreezeSetting = () => {
  const { stored, reducedBySystem, setLevel } = useBreeze();

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] font-semibold text-ink-secondary">Breeze level</span>
        <span className="font-mono text-xs text-ink-tertiary">
          {reducedBySystem ? 'Reduced motion' : `${BREEZE_KMH[stored]} km/h`}
        </span>
      </div>

      <SegmentedControl
        size="md"
        label={
          reducedBySystem ? 'Breeze level, held still because your system asks for reduced motion' : 'Breeze level'
        }
        options={OPTIONS}
        value={stored}
        onChange={id => setLevel(asBreezeLevel(id))}
        className="flex w-full"
      />

      <p className="text-sm text-ink-secondary">
        {reducedBySystem
          ? 'Your system asks for reduced motion, so the wind and the cards stay still here. Your choice still applies on your other devices.'
          : 'Cards on a board sway at Gusty. Any lower level keeps them still, and Still stops all ambient motion.'}
      </p>
    </div>
  );
};

export default BreezeSetting;
