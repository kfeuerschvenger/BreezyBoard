import {
  IconAlertTriangle,
  IconBug,
  IconFileText,
  IconFolder,
  IconMessage,
  IconPhone,
  IconSquareCheck,
  IconTarget,
  IconUserPlus,
  type Icon,
} from '@tabler/icons-react';

/**
 * The glyph for each icon name a board template can carry.
 *
 * A template stores its icon as a string in the database, so resolving one
 * means looking a runtime value up in a table. The table is explicit rather
 * than the whole icon namespace indexed by name: it keeps every other glyph
 * out of the bundle, and a name the table does not know falls back to the
 * folder instead of rendering nothing. The stored names are PascalCase and
 * are the keys of the seeded templates, so the table is the contract between
 * the seed data and the interface.
 */
const iconsByName: Record<string, Icon> = {
  Folder: IconFolder,
  CheckSquare: IconSquareCheck,
  Target: IconTarget,
  Bug: IconBug,
  FileText: IconFileText,
  Phone: IconPhone,
  MessageSquare: IconMessage,
  UserPlus: IconUserPlus,
  AlertTriangle: IconAlertTriangle,
};

/** The named icon, or a folder when the name is absent or unknown. */
export const resolveIcon = (name: string | null | undefined): Icon =>
  (name ? iconsByName[name] : undefined) ?? IconFolder;
