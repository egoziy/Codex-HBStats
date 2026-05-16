/**
 * RTL helpers — single source of truth for "which flex direction to use for
 * a Hebrew row of children".
 *
 * Why this is needed:
 *  - On a real device (EAS dev/preview build) with `I18nManager.forceRTL(true)`,
 *    React Native auto-flips `flex-row` into `row-reverse`. We should write
 *    `'row'` in source and let native flip it.
 *  - On Expo Go (older RN runtime), the same `forceRTL` call doesn't actually
 *    flip flex-row, so `'row'` renders LTR. We need to write `'row-reverse'`
 *    in source.
 *
 * `rtlRow()` returns the correct direction for the current runtime so a row
 * that should visually read RTL renders correctly everywhere.
 */

import { I18nManager } from 'react-native';

/**
 * Returns the flexDirection value that produces a *visually right-to-left*
 * row in the current runtime. Use for rows of children where the FIRST child
 * should sit on the RIGHT (start in RTL).
 */
export function rtlRow(): 'row' | 'row-reverse' {
  return I18nManager.isRTL ? 'row' : 'row-reverse';
}

/** True when native flex-row auto-flips (i.e. dev/preview build). */
export const NATIVE_RTL = I18nManager.isRTL;
