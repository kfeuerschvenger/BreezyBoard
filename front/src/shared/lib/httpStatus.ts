import { isAxiosError } from 'axios';

/** The HTTP status of a failed request, or undefined when no response came back at all. */
export const httpStatusOf = (error: unknown): number | undefined =>
  isAxiosError(error) ? error.response?.status : undefined;

/**
 * The machine-readable `code` of a failed request's error body, or undefined
 * when there is none. The API sends one in every error envelope, and a
 * caller that must tell two failures of the same status apart reads it here
 * rather than comparing message text.
 */
export const apiErrorCodeOf = (error: unknown): string | undefined => {
  if (!isAxiosError(error)) {
    return undefined;
  }

  const code = (error.response?.data as { code?: unknown } | undefined)?.code;

  return typeof code === 'string' ? code : undefined;
};

/**
 * Whether a failed read means the address does not lead to anything the
 * caller can see, as opposed to the request having failed.
 *
 * 404 is a resource that is not there, and that includes a soft deleted one.
 * 403 is one the caller may not read. 400 is an address that is not even
 * shaped like an identifier, which the server rejects before it looks. All
 * three are answers about the address, and retrying any of them returns the
 * same answer, so a page shows them as "not found" and offers a way out
 * instead of a retry. Folding 403 in with 404 also keeps the page from
 * confirming that an id someone else owns exists.
 *
 * A network failure has no status and a 5xx is the server's fault, not the
 * address's, so neither is a match: those are the cases where trying again
 * can change the result.
 */
export const isAddressUnreachable = (error: unknown): boolean => {
  const status = httpStatusOf(error);

  return status === 400 || status === 403 || status === 404;
};
