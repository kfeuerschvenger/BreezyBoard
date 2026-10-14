import mongoose from 'mongoose';
import { createColumnSchema } from './column.schema.js';

const boardSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },
    description: String,
    color: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ColorPalette',
      required: true,
    },
    // Provenance only, and the source of the icon shown on the dashboard.
    // The columns below were copied out of this template when the board was
    // created and no longer track it, so pointing a board at a different
    // template afterwards would change its icon and nothing else. That is
    // why `template` is not in the update whitelist.
    template: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BoardTemplate',
      default: null,
    },
    // The board's own columns, copied from its template at creation. A task's
    // `status` holds the id of one of these subdocuments, so these ids are
    // the board's alone: renaming, adding or removing a column here affects
    // no other board, which was not true while columns lived on the shared
    // template.
    columns: {
      type: [createColumnSchema()],
      default: [],
    },
    // Required, with no exceptions and no null case. Every account gets a
    // personal workspace at registration, so a board always has one to
    // belong to and no query anywhere needs a branch for boards that belong
    // to nothing.
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    // Set when the owner deletes the board, cleared when they restore it.
    // A board with a date here is invisible to every read and authorization
    // path and its tasks are untouched, so a restore brings back exactly what
    // was there. The purge job removes the board and its tasks for good once
    // the date is older than the retention window.
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        ret.taskCount = doc.taskCount;
        ret.memberCount = doc.memberCount;
        return ret;
      },
    },
  }
);

// Virtuals for stadistics
boardSchema.virtual('taskCount', {
  ref: 'Task',
  localField: '_id',
  foreignField: 'boardId',
  count: true,
  // A soft deleted task is not on the board, so it is not in its count.
  match: { deletedAt: null },
});

boardSchema.virtual('memberCount').get(function () {
  return this.members.length;
});

// There used to be a `progress` virtual here. It was dead code in three
// separate ways and is replaced by an aggregation in board.service.js.
//
// It was declared as an async getter, which Mongoose does not support, so it
// would have yielded a pending Promise rather than a number. The dashboard
// read it through a `.lean()` query, which strips virtuals, so it was
// undefined before the Promise ever mattered. And its completion test
// compared `status` to the literal 'done', while status holds a column id,
// so the comparison could never be true. Average progress was zero by
// construction, which is finding P2-4.

// The board list and the dashboard both run visibleBoardFilter, which asks
// for boards in a set of workspaces that the caller either created or is a
// member of. These are the three fields that filter answers on.
//
// Three separate indexes rather than one compound, because the filter is an
// $or over createdBy and members with workspaceId $and-ed across it, and
// Mongo can only use one index per $or branch. A compound index would serve
// one branch and leave the other scanning.
boardSchema.index({ workspaceId: 1 });
boardSchema.index({ createdBy: 1 });
boardSchema.index({ members: 1 });

// Serves the purge scan for boards past retention. Partial, so the index
// holds only the few boards currently in the deleted state rather than one
// null entry per live board.
boardSchema.index({ deletedAt: 1 }, { partialFilterExpression: { deletedAt: { $type: 'date' } } });

const Board = mongoose.model('Board', boardSchema);

export default Board;
