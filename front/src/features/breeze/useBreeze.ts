import { useContext } from 'react';
import { BreezeContext } from './breezeContext';

/**
 * The ambient motion level of the interface. Read `level` to decide what to
 * play and `stored` to show what the person chose: the two differ when the
 * system asks for reduced motion.
 */
export const useBreeze = () => useContext(BreezeContext);

export default useBreeze;
