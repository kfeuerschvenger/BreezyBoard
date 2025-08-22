import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import env from '../config/env.js';
import ApiError from '../utils/apiError.js';

export const registerUser = async userData => {
  const { firstName, lastName, email, password } = userData;

  // Verify if the user already exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw new ApiError(400, 'Email already in use');
  }

  // Hash the password
  const salt = await bcrypt.genSalt(env.SALT);
  const hashedPassword = await bcrypt.hash(password, salt);

  // Create new user
  const user = await User.create({
    firstName,
    lastName,
    email,
    password: hashedPassword,
  });

  // Generate JWT token
  const token = jwt.sign({ id: user._id }, env.JWT_SECRET, {
    expiresIn: '1d',
  });

  return { token, user };
};

export const loginUser = async (email, password) => {
  // Verify if the user exists
  const user = await User.findOne({ email }).select('+password');
  if (!user) {
    throw new ApiError(401, 'Invalid credentials');
  }

  // Verify password
  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    throw new ApiError(401, 'Invalid credentials');
  }

  // Generate JWT token
  const token = jwt.sign({ id: user._id }, env.JWT_SECRET, {
    expiresIn: '1d',
  });

  return { token, user };
};
