// One polite live region for every field that announces a saved change. It is
// created in the page body when the first user appears and removed when the
// last one goes, so a page with nine editable names carries one region and not
// nine, and nothing is left behind once none is on the page. It does not depend
// on a provider: a component that announces through it works wherever it is
// rendered.
let region: HTMLElement | null = null;
let users = 0;

/** Starts using the shared region and answers the function that stops using it. */
export const acquireAnnouncer = (): (() => void) => {
  if (users === 0) {
    region = document.createElement('span');
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', 'polite');
    region.className = 'sr-only';
    document.body.appendChild(region);
  }

  users += 1;

  return () => {
    users -= 1;

    if (users === 0) {
      region?.remove();
      region = null;
    }
  };
};

/** Replaces what the region says. An empty message clears it. */
export const announce = (message: string) => {
  if (region) region.textContent = message;
};
