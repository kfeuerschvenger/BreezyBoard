import mongoose from 'mongoose';

// Helper function to capitalize the first letter of a string
const capitalize = str => {
  if (!str || typeof str !== 'string') return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

const userSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    lastName: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      select: false,
    },
    avatar: {
      type: String,
      default: '',
    },
    role: {
      type: String,
      default: 'Member',
    },
    department: {
      type: String,
      default: 'General',
    },
    location: {
      type: String,
      default: '',
    },
    // Bumped on logout and on password change so a token minted before the
    // bump fails the middleware's tokenVersion check even though its
    // signature and exp are still valid. This is what gives the sliding
    // session real revocation instead of a purely stateless one.
    tokenVersion: {
      type: Number,
      default: 0,
    },
    // The pending password reset, if any. Only the SHA-256 of the token is
    // kept, so a read of the database cannot be turned into a working reset
    // link. One pair per user: issuing a new token overwrites the pair and
    // that is what invalidates the previous one. Never selected by default,
    // like the password.
    passwordResetTokenHash: {
      type: String,
      select: false,
      index: { sparse: true },
    },
    passwordResetExpiresAt: {
      type: Date,
      select: false,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => {
        ret.firstName = capitalize(ret.firstName);
        ret.lastName = capitalize(ret.lastName);
        ret.location = capitalize(ret.location);
        delete ret.password;
        delete ret.__v;
        delete ret.tokenVersion;
        delete ret.passwordResetTokenHash;
        delete ret.passwordResetExpiresAt;
        return ret;
      },
    },
  }
);

// Middleware to capitalize first and last names before saving
userSchema.pre('save', function (next) {
  if (this.isModified('firstName')) {
    this.firstName = capitalize(this.firstName);
  }

  if (this.isModified('lastName')) {
    this.lastName = capitalize(this.lastName);
  }

  if (this.isModified('location')) {
    this.location = capitalize(this.location);
  }
  next();
});

// Middleware to capitalize first and last names before updating
userSchema.pre('findOneAndUpdate', function (next) {
  const update = this.getUpdate();

  if (update?.firstName) {
    update.firstName = capitalize(update.firstName);
  }

  if (update?.lastName) {
    update.lastName = capitalize(update.lastName);
  }

  if (update?.location) {
    update.location = capitalize(update.location);
  }

  next();
});

const User = mongoose.model('User', userSchema);

export default User;
