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

const Board = mongoose.model('Board', boardSchema);

export default Board;
