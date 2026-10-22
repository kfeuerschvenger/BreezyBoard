import type { BreezeLevel } from '@/models';

export type { BreezeLevel } from '@/models';

/** Every level, from none to the most, in the order the control lists them. */
export const BREEZE_LEVELS: readonly BreezeLevel[] = ['still', 'calm', 'breezy', 'gusty'];

/** What a person who has never chosen one gets. */
export const DEFAULT_BREEZE: BreezeLevel = 'breezy';

/** The wind speed each level stands for, in kilometres an hour. It is a label and measures nothing. */
export const BREEZE_KMH: Record<BreezeLevel, number> = { still: 0, calm: 12, breezy: 38, gusty: 74 };

export const BREEZE_LABEL: Record<BreezeLevel, string> = {
  still: 'Still',
  calm: 'Calm',
  breezy: 'Breezy',
  gusty: 'Gusty',
};

/** Narrows what came off the wire: a record from before the field, or a value this build does not know. */
export const asBreezeLevel = (value: unknown): BreezeLevel =>
  BREEZE_LEVELS.includes(value as BreezeLevel) ? (value as BreezeLevel) : DEFAULT_BREEZE;
