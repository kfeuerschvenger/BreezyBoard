export const clearAuth = () => {
  try {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  } catch (e) {
    console.warn('Could not clear localStorage', e);
  }
};

export const redirectToLogin = () => {
  if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
    window.location.replace('/login');
  }
};

/**
 * Decodes the payload segment of a `header.payload.signature` JWT, without
 * verifying its signature. This is the client reading its own claims for UI
 * purposes (the expiry deadline), not an authentication check, so a
 * malformed or corrupted token is treated the same as no token at all:
 * every failure path returns null instead of throwing.
 */
export const decodeJwtPayload = (token: string): Record<string, unknown> | null => {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const decoded = atob(padded);

    return JSON.parse(decoded);
  } catch {
    return null;
  }
};
