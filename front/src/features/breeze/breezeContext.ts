import { createContext } from 'react';
import type { BreezeLevel } from './breeze';

export interface BreezeContextValue {
  /** What the person chose. It is never overwritten by what the device asks for. */
  stored: BreezeLevel;
  /**
   * What the interface should play: the stored choice, or `still` when the
   * system asks for reduced motion. Every ambient animation reads this one.
   */
  level: BreezeLevel;
  /** True when the system's reduced motion preference is what holds `level` at still. */
  reducedBySystem: boolean;
  /** Saves a new choice at once, and tells the person if it could not be stored. */
  setLevel: (level: BreezeLevel) => void;
}

/**
 * With no provider the wind is still. A component that reads the level can be
 * rendered on its own, and a still sky is the answer that animates nothing.
 */
export const STILL_BREEZE: BreezeContextValue = {
  stored: 'still',
  level: 'still',
  reducedBySystem: false,
  setLevel: () => undefined,
};

export const BreezeContext = createContext<BreezeContextValue>(STILL_BREEZE);
