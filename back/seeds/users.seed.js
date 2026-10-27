import './requireSeedEnvironment.js';
import mongoose from 'mongoose';
import env from '../src/config/env.js';
import bcrypt from 'bcryptjs';
import User from '../src/models/User.js';
import Workspace from '../src/models/Workspace.js';

/** The environment variable that holds the password of every example account. */
const PASSWORD_VARIABLE = 'SEED_USER_PASSWORD';

/** The shortest password the registration rules accept. */
const MIN_PASSWORD_LENGTH = 8;

const connectDB = async () => {
  try {
    await mongoose.connect(env.MONGODB_URI);
    console.log('MongoDB connected');
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
};

// Example accounts on a reserved domain. Their password is not written here:
// it comes from the environment, so no credential lives in the repository.
const seedUsers = [
  {
    firstName: 'olivia',
    lastName: 'owner',
    email: 'owner@breezyboard.local',
    role: 'Admin',
    department: 'Management',
    avatar: '',
  },
  {
    firstName: 'admin',
    lastName: 'user',
    email: 'admin@breezyboard.local',
    role: 'Admin',
    department: 'Management',
    avatar: 'https://i.pravatar.cc/150?u=admin',
  },
  {
    firstName: 'john',
    lastName: 'doe',
    email: 'john@breezyboard.local',
    role: 'Developer',
    department: 'Engineering',
    avatar: 'https://i.pravatar.cc/150?u=john',
  },
  {
    firstName: 'jane',
    lastName: 'smith',
    email: 'jane@breezyboard.local',
    role: 'Designer',
    department: 'Creative',
    avatar: 'https://i.pravatar.cc/150?u=jane',
  },
  {
    firstName: 'mike',
    lastName: 'johnson',
    email: 'mike@breezyboard.local',
    role: 'Manager',
    department: 'Operations',
    avatar: 'https://i.pravatar.cc/150?u=mike',
  },
  {
    firstName: 'sarah',
    lastName: 'williams',
    email: 'sarah@breezyboard.local',
    role: 'QA',
    department: 'Testing',
    avatar: 'https://i.pravatar.cc/150?u=sarah',
  },
];

const seed = async () => {
  const password = process.env[PASSWORD_VARIABLE] ?? '';

  // Without a password there is nothing safe to create, and deleting the
  // existing accounts first would leave a database with none. The script ends
  // before it touches anything, and says how to run it, so the reference
  // data seed that runs next to it still completes.
  if (password.length < MIN_PASSWORD_LENGTH) {
    console.warn(
      `Skipping the example accounts: ${PASSWORD_VARIABLE} must be set to a password of at least ` +
        `${MIN_PASSWORD_LENGTH} characters. Nothing was changed. For example: ` +
        `docker compose exec -e ${PASSWORD_VARIABLE}=<password> back npm run seed:users`
    );
    process.exit();
  }

  await connectDB();

  // Delete existing users, and the personal workspaces that belong to them.
  // Leaving those behind would orphan a workspace per seeded account on
  // every run, and the next seed would create another set.
  await User.deleteMany();
  await Workspace.deleteMany({ isPersonal: true });

  // One hash for every account: the password is the same, and hashing is the
  // slow part.
  const salt = await bcrypt.genSalt(env.SALT);
  const hashedPassword = await bcrypt.hash(password, salt);

  // Create users with hashed passwords. Each one gets the personal
  // workspace that registration would have given it, because a user without
  // one cannot create a board at all.
  for (const user of seedUsers) {
    const created = await User.create({
      ...user,
      password: hashedPassword,
    });

    await Workspace.create({
      name: 'Personal',
      createdBy: created._id,
      members: [{ user: created._id, role: 'admin' }],
      isPersonal: true,
    });
  }

  console.log('Database seeded with users successfully');
  process.exit();
};

seed();
