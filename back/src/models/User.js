import mongoose from 'mongoose';

/** The ambient motion levels, from none to the most. */
export const BREEZE_LEVELS = ['still', 'calm', 'breezy', 'gusty'];

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
    // How much ambient motion the interface plays. It is stored on the person
    // rather than in the browser so the choice follows them across devices.
    // A record written before the field existed reads as the default.
    breeze: {
      type: String,
      enum: BREEZE_LEVELS,
      default: 'breezy',
    },
    // Bumped on logout and on password change so a token minted before the
    // bump fails the middleware's tokenVersion check even though its
    // signature and exp are still valid. This is what gives the sliding
    // session real revocation instead of a purely stateless one.
    tokenVersion: {
      type: Number,
      default: 0,
    },
    // The password reset links that are still outstanding, oldest first. Only
    // the SHA-256 of each token is kept, so a read of the database cannot be
    // turned into a working reset link. Each carries its own expiry. Asking
    // for a new link adds to the list and never touches the earlier ones,
    // because the request is anonymous: if it replaced them, anybody who knew
    // an address could kill the link its owner had just been sent. The list is
    // capped, dropping the oldest, so it cannot grow without bound. A
    // successful reset or a password change empties it. Never selected by
    // default, like the password.
    passwordResets: {
      type: [
        {
          _id: false,
          tokenHash: { type: String, required: true },
          expiresAt: { type: Date, required: true },
        },
      ],
      select: false,
      default: undefined,
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
        delete ret.passwordResets;
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

// Looked up by hash when a link is used.
userSchema.index({ 'passwordResets.tokenHash': 1 }, { sparse: true });

const User = mongoose.model('User', userSchema);

export default User;
