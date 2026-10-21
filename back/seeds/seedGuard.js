import mongoose from 'mongoose';

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

const UNPARSEABLE = 'an unparseable connection string';

/**
 * The hosts of a MongoDB connection string that are not local, in the order
 * the driver reports them.
 *
 * The driver parses the string, not this module: the driver is what connects,
 * so a parser written here that read the credentials or the authority even
 * slightly differently would approve a host the driver then reaches, which for
 * a script that deletes data is a fail-open. Constructing a client parses the
 * string and opens no connection and no handle. A string the driver refuses is
 * refused here and reported without any part of it, because it holds the
 * credentials.
 *
 * A `mongodb+srv` string is always remote: it names a DNS record that resolves
 * to the hosts, so nothing written in it can be local. The driver reports that
 * record as `srvHost`, and resolving it is left to the connection, which never
 * happens here. A unix socket is a file on this machine and is local.
 *
 * @param {string} uri
 * @returns {string[]}
 */
const remoteHostsOf = uri => {
  let options;

  try {
    options = new mongoose.mongo.MongoClient(uri).options;
  } catch {
    return [UNPARSEABLE];
  }

  if (options.srvHost) {
    return [options.srvHost];
  }

  if (!Array.isArray(options.hosts) || options.hosts.length === 0) {
    return [UNPARSEABLE];
  }

  const remote = options.hosts
    .filter(address => !address.socketPath && !LOCAL_HOSTS.includes(address.host))
    .map(address => address.host);

  return [...new Set(remote)];
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
