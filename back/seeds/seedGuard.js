// The environments a seed script may run in. Both seeds start by deleting
// every document of a collection, and the user seed then creates accounts with
// passwords that are written in this repository, so pointing one at a database
// that holds real data is destructive and, for the accounts, a backdoor.
const SEEDABLE_ENVIRONMENTS = ['development', 'test'];

// The database hosts a seed may reach without being told so: this machine, and
// the `mongo` service of docker-compose.yml, which is how the back container
// reaches its database. Anything else is a database somewhere else, and
// NODE_ENV says nothing about what that one holds.
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1', 'mongo'];

/** The flag that lets a seed run against a database that is not local. */
export const ALLOW_REMOTE_FLAG = '--allow-remote';

// What a host name or an address looks like. Anything else came from a
// connection string that could not be read, and may hold a piece of a password.
const HOST_NAME = /^[a-z0-9]([a-z0-9._-]*[a-z0-9])?$/;
const IPV6_ADDRESS = /^[0-9a-f:.]*:[0-9a-f:.]*$/;
const UNPARSEABLE_HOST = 'an unparseable host';

const isHostLike = host => HOST_NAME.test(host) || IPV6_ADDRESS.test(host);

/** The host names of one authority string, credentials cut at its last `@`. */
const hostsOfAuthority = authority =>
  authority
    .slice(authority.lastIndexOf('@') + 1)
    .split(',')
    .map(host => (host.startsWith('[') ? host.slice(1, host.indexOf(']')) : host.replace(/:\d*$/, '')))
    .map(host => host.toLowerCase());

/**
 * The host names of a MongoDB connection string, without its credentials, its
 * ports or its options. A replica set lists several, separated by commas.
 *
 * Parsed by hand because the driver's own parser connects, and because a
 * password may hold characters a URL parser rejects. Everything before the
 * last `@` of the authority is the credentials and is dropped unread.
 *
 * The authority ends at the first `/`, `?` or `#`, unless the password holds
 * one of them unescaped. Then the text up to that character holds no `@`
 * although one follows, and the string has two readings: the credentials end at
 * the last `@` of the whole string, or that `@` belongs to an option and the
 * authority really is the short text. When only one reading yields host names
 * it is the right one, because the other is the start of a password. When both
 * do, both are reported, so that an `@` inside an option can never make a
 * remote host look local. A host that is not host-like is never echoed, it is
 * reported as an unparseable host.
 *
 * @param {string} uri
 * @returns {string[]}
 */
const hostsOf = uri => {
  const rest = uri.replace(/^[a-z+]+:\/\//i, '');
  const authority = rest.split(/[/?#]/)[0];
  const direct = hostsOfAuthority(authority);

  const ambiguous = !authority.includes('@') && rest.includes('@');
  const candidates = [direct];

  if (ambiguous) {
    candidates.push(hostsOfAuthority(rest.slice(rest.lastIndexOf('@') + 1).split(/[/?#]/)[0]));
  }

  const readable = candidates.filter(hosts => hosts.every(isHostLike));
  const chosen = readable.length > 0 ? readable.flat() : [UNPARSEABLE_HOST];

  return [...new Set(chosen)];
};

/**
 * The hosts of a connection string that are not local, in the order written.
 * A `mongodb+srv` string is always remote: it names a DNS record that resolves
 * to the hosts, so nothing written in it can be local.
 *
 * @param {string} uri
 * @returns {string[]}
 */
const remoteHostsOf = uri => {
  const hosts = hostsOf(uri);

  if (/^mongodb\+srv:\/\//i.test(uri)) {
    return hosts;
  }

  return hosts.filter(host => !LOCAL_HOSTS.includes(host));
};

/**
 * Why a seed script may not run, or null when it may.
 *
 * Two independent checks, and both must pass. The environment must be named
 * explicitly: an unset NODE_ENV is refused, although the application treats it
 * as development, because a deployment that forgot to set it is exactly the
 * one that must not be wiped. And the database must be local, because
 * NODE_ENV=development with a MONGODB_URI copied from another environment
 * would otherwise delete that environment's data. `--allow-remote` is the
 * deliberate way past the second check and never past the first.
 *
 * The message names hosts, never the connection string: it carries the
 * credentials.
 *
 * @param {string | undefined} nodeEnv
 * @param {{ mongoUri?: string, allowRemote?: boolean }} [options] An unset
 *   connection string is the local default the application falls back to.
 * @returns {string | null}
 */
export const seedRefusal = (nodeEnv, { mongoUri, allowRemote = false } = {}) => {
  if (!SEEDABLE_ENVIRONMENTS.includes(nodeEnv)) {
    const found = nodeEnv ? `NODE_ENV is "${nodeEnv}"` : 'NODE_ENV is not set';

    return (
      `Refusing to seed: ${found}. The seed scripts delete existing data and are allowed only when NODE_ENV is ` +
      `${SEEDABLE_ENVIRONMENTS.map(name => `"${name}"`).join(' or ')}. ` +
      'In the development stack run: docker compose exec back npm run seed:all'
    );
  }

  const remote = mongoUri ? remoteHostsOf(mongoUri) : [];

  if (remote.length > 0 && !allowRemote) {
    return (
      `Refusing to seed: MONGODB_URI points at a database that is not local (host ${remote.join(', ')}). ` +
      'The seed scripts delete existing data and are allowed only against ' +
      `${LOCAL_HOSTS.join(', ')}. ` +
      `To seed that database on purpose, run the script directly with ${ALLOW_REMOTE_FLAG}, ` +
      `for example: node seeds/users.seed.js ${ALLOW_REMOTE_FLAG}`
    );
  }

  return null;
};
