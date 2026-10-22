/**
 * What the home page says to somebody, and when it says it.
 *
 * The part of the day follows the clock of the device the page is open on,
 * which is the clock the person is living by. Morning runs from 5:00 up to
 * noon, afternoon from noon up to 18:00, and everything else, the small hours
 * included, is the evening: nobody awake at 2:00 is being greeted with "Good
 * morning".
 */
export type PartOfDay = 'morning' | 'afternoon' | 'evening';

export const partOfDay = (date: Date): PartOfDay => {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  return 'evening';
};

/** "Good morning, Ada." and, with no name to use, "Good morning." */
export const greetingFor = (date: Date, firstName?: string): string => {
  const name = firstName?.trim();
  return `Good ${partOfDay(date)}${name ? `, ${name}` : ''}.`;
};

const DATE_PARTS = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

/** The mono eyebrow above the greeting: "FRIDAY · OCTOBER 9". */
export const eyebrowFor = (date: Date): string => {
  const parts = Object.fromEntries(DATE_PARTS.formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.weekday} · ${parts.month} ${parts.day}`.toUpperCase();
};
