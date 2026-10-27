// One polite live region for every field that announces a message. It is
// created in the page body the first time it is needed and stays there for the
// life of the page, so a page with nine editable names carries one region and
// not nine, and a message said after the last field has gone is still spoken
// and not dropped. It does not depend on a provider: a component that announces
// through it works wherever it is rendered.
let region: HTMLElement | null = null;

const ensureRegion = (): HTMLElement => {
  if (region?.isConnected) return region;

  region = document.createElement('span');
  region.setAttribute('role', 'status');
  region.setAttribute('aria-live', 'polite');
  region.className = 'sr-only';
  document.body.appendChild(region);

  return region;
};

/**
 * Puts the region in the page, empty. A live region that appears together with
 * its first message is announced by few screen readers, so a field calls this
 * when it mounts and the region is there before anything is said.
 */
export const prepareAnnouncer = () => {
  ensureRegion();
};

/** Replaces what the region says. An empty message clears it. */
export const announce = (message: string) => {
  ensureRegion().textContent = message;
};
