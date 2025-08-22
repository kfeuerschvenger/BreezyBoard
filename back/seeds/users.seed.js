import mongoose from 'mongoose';
import env from '../src/config/env.js';
import bcrypt from 'bcryptjs';
import User from '../src/models/User.js';

const connectDB = async () => {
  try {
    await mongoose.connect(env.MONGODB_URI);
    console.log('MongoDB connected');
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
};

const seedUsers = [
  {
    firstName: 'kevin',
    lastName: 'feuerschvenger',
    email: 'kfeuerschvenger@gmail.com',
    password: 'kevin123',
    role: 'Admin',
    department: 'Management',
    avatar: '',
  },
  {
    firstName: 'admin',
    lastName: 'user',
    email: 'admin@example.com',
    password: 'admin123',
    role: 'Admin',
    department: 'Management',
    avatar: 'https://i.pravatar.cc/150?u=admin',
  },
  {
    firstName: 'john',
    lastName: 'doe',
    email: 'john@example.com',
    password: 'john123',
    role: 'Developer',
    department: 'Engineering',
    avatar: 'https://i.pravatar.cc/150?u=john',
  },
  {
    firstName: 'jane',
    lastName: 'smith',
    email: 'jane@example.com',
    password: 'jane123',
    role: 'Designer',
    department: 'Creative',
    avatar: 'https://i.pravatar.cc/150?u=jane',
  },
  {
    firstName: 'mike',
    lastName: 'johnson',
    email: 'mike@example.com',
    password: 'mike123',
    role: 'Manager',
    department: 'Operations',
    avatar: 'https://i.pravatar.cc/150?u=mike',
  },
  {
    firstName: 'sarah',
    lastName: 'williams',
    email: 'sarah@example.com',
    password: 'sarah123',
    role: 'QA',
    department: 'Testing',
    avatar: 'https://i.pravatar.cc/150?u=sarah',
  },
];

const seed = async () => {
  await connectDB();

  // Delete existing users
  await User.deleteMany();

  // Create users with hashed passwords
  for (const user of seedUsers) {
    const salt = await bcrypt.genSalt(env.SALT);
    const hashedPassword = await bcrypt.hash(user.password, salt);

    await User.create({
      ...user,
      password: hashedPassword,
    });
  }

  console.log('Database seeded with users successfully');
  process.exit();
};

seed();
