import 'dotenv/config';
import { ALLOW_REMOTE_FLAG, seedRefusal } from './seedGuard.js';

// Imported first by every destructive seed script. Importing it is the check:
// modules evaluate in import order, so a refusal ends the process before the
// script's own imports are evaluated, and nothing connects to a database or
// deletes anything. `dotenv/config` comes first so NODE_ENV and MONGODB_URI
// are read from the same sources the application reads them from.
const refusal = seedRefusal(process.env.NODE_ENV, {
  mongoUri: process.env.MONGODB_URI?.trim(),
  allowRemote: process.argv.includes(ALLOW_REMOTE_FLAG),
});

if (refusal) {
  console.error(refusal);
  process.exit(1);
}
