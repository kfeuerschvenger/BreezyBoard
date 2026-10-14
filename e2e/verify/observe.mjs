// Waits on observable state for the standing scripts.
//
// A fixed wait or a count of animation frames measures the machine, not the
// page: both pass while the renderer is fast and fail when it stalls, and they
// fail in a different place each time. Every helper here waits for something
// the page can be seen to have done, with a generous bounded timeout, and fails
// with a message that names what it was waiting for.

/** Long enough for a stalled renderer, short enough that a real defect still fails the run. */
export const WAIT_MS = 15000;

/**
 * Resolves when `predicate(arg)` is truthy inside the page. It is polled on
 * animation frames, so it reads the page in step with what is painted.
 */
export const until = async (target, label, predicate, arg, timeout = WAIT_MS) => {
  try {
    return await target.waitForFunction(predicate, arg, { timeout, polling: 'raf' });
  } catch (error) {
    throw new Error(`Timed out after ${timeout} ms waiting for ${label}`, { cause: error });
  }
};

/**
 * Reads state from outside the page until `accept` likes it, and returns the
 * value that was accepted. For what only the script can read: a response body,
 * the API, a stored value. It reads again 50 milliseconds after the previous
 * read returns, so it follows the system's pace instead of a guess at it.
 */
export const poll = async (label, read, accept, timeout = WAIT_MS) => {
  const started = Date.now();
  let value = await read();
  while (!accept(value)) { // NOSONAR javascript:S9382 sequential on purpose: a poll reads, waits, reads again, and the next read depends on the last answer
    if (Date.now() - started > timeout) {
      throw new Error(`Timed out after ${timeout} ms waiting for ${label}; last value ${JSON.stringify(value)}`);
    }
    await new Promise(resolve => setTimeout(resolve, 50)); // NOSONAR javascript:S9382
    value = await read(); // NOSONAR javascript:S9382
  }
  return value;
};

/**
 * Resolves once nothing in the scope is still moving.
 *
 * Moving means one of two things. A CSS animation or transition that has not
 * finished, read from `getAnimations()`, leaving out the ones that repeat
 * forever because ambient wind never ends. Or an inline style or class that is
 * still being rewritten, which is how a JavaScript driven animation such as the
 * modal's spring writes its frames, read from a mutation observer. The scope is
 * quiet when neither has happened for `quiet` milliseconds of wall time.
 *
 * A wall time window and not a count of frames: a frame can take 100 to 250
 * milliseconds on a loaded machine, and the window is measured from the last
 * change, which the observer reports as it happens.
 *
 * @param target a Playwright page
 * @param options.within a selector for the scope, the whole document by default. It has to exist.
 * @param options.quiet milliseconds without a change before the scope counts as still
 * @param options.label what is being waited for, used in the failure message
 */
export const settled = async (target, options = {}) => {
  const { within = null, quiet = 150, timeout = WAIT_MS, label = 'the page to stop animating' } = options;
  const outcome = await target.evaluate(
    ({ within: scopeSelector, quiet: quietMs, timeout: limit }) =>
      new Promise(resolve => {
        const started = performance.now();
        let changedAt = started;
        const scope = () => (scopeSelector ? document.querySelector(scopeSelector) : document.documentElement);
        const observer = new MutationObserver(records => {
          const root = scope();
          if (root && records.some(record => root.contains(record.target))) changedAt = performance.now();
        });
        observer.observe(document.documentElement, {
          subtree: true,
          attributes: true,
          attributeFilter: ['style', 'class'],
          childList: true,
        });
        const unfinished = root =>
          root.getAnimations({ subtree: true }).filter(animation => {
            const iterations = animation.effect?.getComputedTiming().iterations;
            return iterations !== undefined && iterations !== Infinity && animation.playState === 'running';
          });
        const tick = () => {
          const now = performance.now();
          const root = scope();
          const running = root ? unfinished(root) : [];
          if (root && running.length === 0 && now - changedAt >= quietMs) {
            observer.disconnect();
            return resolve({ ok: true });
          }
          if (now - started > limit) {
            observer.disconnect();
            return resolve({
              ok: false,
              reason: root
                ? `${running.length} animation(s) still running (${running.map(a => a.animationName ?? a.transitionProperty ?? 'script').join(', ')}), last style change ${Math.round(now - changedAt)} ms ago`
                : `${scopeSelector} is not in the page`,
            });
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    { within, quiet, timeout },
  );
  if (!outcome.ok) throw new Error(`Timed out after ${timeout} ms waiting for ${label}: ${outcome.reason}`);
};

/**
 * Starts recording an element's opacity and transform on every frame from the
 * moment it exists until it is at rest: fully opaque with no transform. Call it
 * before the action that makes the element appear, then `readAppearance` after.
 *
 * What is asserted afterwards is read from the series and never from a frame
 * number: the first sample is the element's initial values, the last is its rest,
 * and what lies between says whether it travelled.
 */
export const armAppearance = (target, selector, timeout = WAIT_MS) =>
  target.evaluate(
    ({ selector: query, timeout: limit }) => {
      window.__appearance = new Promise((resolve, reject) => {
        const started = performance.now();
        const samples = [];
        const isRest = sample => sample.opacity === 1 && (sample.transform === 'none' || sample.transform === 'matrix(1, 0, 0, 1, 0, 0)');
        const step = () => {
          const element = document.querySelector(query);
          if (element) {
            const style = getComputedStyle(element);
            const sample = { opacity: Number(style.opacity), transform: style.transform };
            samples.push(sample);
            if (isRest(sample)) return resolve(samples);
          }
          if (performance.now() - started > limit) {
            return reject(new Error(`${query} never came to rest: ${samples.length} frames, last ${JSON.stringify(samples.at(-1) ?? null)}`));
          }
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
    },
    { selector, timeout },
  );

/** The samples of a recording started by `armAppearance`. */
export const readAppearance = target => target.evaluate(() => window.__appearance);

/** True when a computed transform is the identity. */
export const isIdentityTransform = transform => transform === 'none' || transform === 'matrix(1, 0, 0, 1, 0, 0)';

/** How many different transforms, other than rest, a recording shows. A panel that travels shows many. */
export const distinctMidTransforms = samples =>
  new Set(samples.map(sample => sample.transform).filter(transform => !isIdentityTransform(transform))).size;
