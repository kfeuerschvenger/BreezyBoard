import mongoose from 'mongoose';

/**
 * Membership of a workspace, carrying the member's role in it.
 *
 * A record rather than a bare id array, which is the same shape lesson the
 * board members array taught: a flat array of ids can only answer "is this
 * person in", and every question worth asking about access is finer than
 * that. `admin` administers every board in the workspace, including boards
 * they were never added to; `member` may be added to boards individually
 * and has no standing otherwise.
 *
 * There is deliberately no viewer role yet. Adding one means one entry in
 * the rank table and one branch in resolveBoardRole, and no routes, so it
 * costs the same later as it would now.
 */
const workspaceMemberSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    role: {
      type: String,
      enum: ['admin', 'member'],
      default: 'member',
      required: true,
    },
  },
  { _id: false }
);

const workspaceSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    members: {
      type: [workspaceMemberSchema],
      default: [],
    },
    // Every account gets one of these at registration, so that a new user
    // can create a board without first being asked what a workspace is and
    // without any query ever having to handle a board that belongs to
    // nothing. It is an ordinary workspace in every other respect; the flag
    // exists so the interface can present it differently and so it can be
    // protected from deletion later.
    isPersonal: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Every board listing and every authorization check starts by asking which
// workspaces this user belongs to.
workspaceSchema.index({ 'members.user': 1 });

const Workspace = mongoose.model('Workspace', workspaceSchema);

export default Workspace;
