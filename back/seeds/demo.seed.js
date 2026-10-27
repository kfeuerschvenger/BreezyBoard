import './requireSeedEnvironment.js';
import mongoose from 'mongoose';
import env from '../src/config/env.js';
import { DEMO_EMAIL } from './demo/demoData.js';
import { seedDemo } from './demo/seedDemo.js';

/** The environment variable that holds the password of the demo accounts. */
const PASSWORD_VARIABLE = 'DEMO_PASSWORD';

/** The shortest password the registration rules accept. */
const MIN_PASSWORD_LENGTH = 8;

const password = process.env[PASSWORD_VARIABLE] ?? '';

// There is no default: a password written in the repository is a credential
// for every clone of it. The check comes before the connection so that a
// missing value touches nothing.
if (password.length < MIN_PASSWORD_LENGTH) {
  console.error(
    `${PASSWORD_VARIABLE} must be set to a password of at least ${MIN_PASSWORD_LENGTH} characters. ` +
      `For example: docker compose exec -e ${PASSWORD_VARIABLE}=<password> back npm run seed:demo`
  );
  process.exit(1);
}

try {
  await mongoose.connect(env.MONGODB_URI);
  const summary = await seedDemo({ password, saltRounds: env.SALT });

  console.log(`Demo workspace seeded: ${summary.boards} boards and ${summary.tasks} cards. Sign in as ${DEMO_EMAIL}.`);
  await mongoose.disconnect();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
