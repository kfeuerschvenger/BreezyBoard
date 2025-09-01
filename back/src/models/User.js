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
