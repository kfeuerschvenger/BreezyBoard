import * as Icons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * The lucide-react namespace narrowed to the icon components in it.
 *
 * Templates name their icon as a string, so resolving one means indexing a
 * namespace by a value only known at runtime. Doing that directly needs a
 * cast; filtering once into a typed record does not, and it also excludes
 * the helpers in that namespace, such as `createLucideIcon`, which is a
 * plain function and is not a valid JSX element type.
 */
const iconsByName: Record<string, LucideIcon> = Object.fromEntries(
  Object.entries(Icons).filter((entry): entry is [string, LucideIcon] => typeof entry[1] === 'object')
);

/** The named icon, or a folder when the name is absent or unknown. */
export const resolveIcon = (name: string | null | undefined): LucideIcon =>
  (name ? iconsByName[name] : undefined) ?? Icons.Folder;
