// The environments a seed script may run in. Both seeds start by deleting
// every document of a collection, and the user seed then creates accounts with
// passwords that are written in this repository, so pointing one at a database
// that holds real data is destructive and, for the accounts, a backdoor.
const SEEDABLE_ENVIRONMENTS = ['development', 'test'];

/**
 * Why a seed script may not run, or null when it may.
 *
 * The value must be set explicitly. An unset NODE_ENV is refused, although
 * the application treats it as development: a deployment that forgot to set
 * it is exactly the one that must not be wiped.
 *
 * @param {string | undefined} nodeEnv
 * @returns {string | null}
 */
export const seedRefusal = nodeEnv => {
  if (SEEDABLE_ENVIRONMENTS.includes(nodeEnv)) {
    return null;
  }

  const found = nodeEnv ? `NODE_ENV is "${nodeEnv}"` : 'NODE_ENV is not set';

  return (
    `Refusing to seed: ${found}. The seed scripts delete existing data and are allowed only when NODE_ENV is ` +
    `${SEEDABLE_ENVIRONMENTS.map(name => `"${name}"`).join(' or ')}. ` +
    'In the development stack run: docker compose exec back npm run seed:all'
  );
};
