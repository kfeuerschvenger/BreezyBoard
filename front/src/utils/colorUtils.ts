import type { Color } from '@/models';
import { ColorService } from '@/services';

export type ColorInput = Color | string | null | undefined;

/**
 * Simple in-memory cache to avoid multiple requests.
 * TTL not implemented here for simplicity.
 */
const colorCache = new Map<string, Color>();

/** Validates if a string is a valid hex color (#RGB or #RRGGBB) */
const isHexColor = (value: string): boolean => {
  if (!value) return false;
  const v = value.trim();
  return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(v);
};

/**
 * Synchronous resolver: don't make API calls.
 * Ideal for immediate values (use fallback if no value).
 */
export const resolveColorValueSync = (color: ColorInput, fallback = '#64748B'): string => {
  if (!color) return fallback;

  if (typeof color === 'string') {
    if (isHexColor(color)) return color.trim(); // If the string is already a hex color, return it
    return fallback; // otherwise it's likely an id -> cannot resolve synchronously
  }

  if (typeof color === 'object') {
    if (color.value) return color.value;
    return fallback;
  }

  return fallback;
};

/**
 * Async resolver: if it receives an id (string) or an object without `value`, it tries to fetch the color from the service.
 * Uses internal cache to reduce calls.
 */
export const resolveColorValue = async (color: ColorInput, fallback = '#64748B'): Promise<string> => {
  if (!color) return fallback;

  // If is a string, it can be either a hex code or an _id
  if (typeof color === 'string') {
    const trimmed = color.trim();

    // If it's already a hex color, return immediately
    if (isHexColor(trimmed)) return trimmed;

    // Otherwise assume it's an id
    const id = trimmed;
    const cached = colorCache.get(id);
    if (cached?.value) return cached.value;
    try {
      const fetched = await ColorService.getById(id);
      if (fetched && fetched.value) {
        colorCache.set(id, fetched);
        return fetched.value;
      }
      return fallback;
    } catch (err: unknown) {
      console.warn('Failed to fetch color by id', (err as Error)?.message ?? err);
      return fallback;
    }
  }

  // If it's an object
  if (typeof color === 'object') {
    if (color.value) return color.value;

    const id = (color as Color)._id;
    if (id) {
      const cached = colorCache.get(id);
      if (cached?.value) return cached.value;
      try {
        const fetched = await ColorService.getById(id);
        if (fetched && fetched.value) {
          colorCache.set(id, fetched);
          return fetched.value;
        }
        return fallback;
      } catch (err: unknown) {
        console.warn('Failed to fetch color by id', (err as Error)?.message ?? err);
        return fallback;
      }
    }
    return fallback;
  }

  return fallback;
};

/**
 * Util: force clear cache (useful in tests or when you know the palette has changed).
 */
export const clearColorCache = () => {
  colorCache.clear();
};
