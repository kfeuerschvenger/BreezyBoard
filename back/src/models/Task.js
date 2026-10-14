import mongoose from 'mongoose';

const checklistItemSchema = new mongoose.Schema({
  text: {
    type: String,
    required: true,
  },
  completed: {
    type: Boolean,
    default: false,
  },
});

const taskSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },
    description: String,
    // Not a free label. This holds the _id of a column subdocument inside the
    // BoardTemplate the task's board was created from, which is why `priority`
    // right next to it can be an enum and this cannot: the set of valid values
    // is different for every board and lives in another collection.
    //
    // What a schema can still say is the shape, and that alone closes the
    // demonstrated defect. A task written with a status like 'todo' used to be
    // accepted, and then rendered in no column at all: invisible in the board
    // while still counting in every total. It is refused here now.
    //
    // The remaining half, that the id names a column of this particular board
    // rather than some other board's, is enforced in task.service.js, because
    // it needs a second document to answer and Mongoose cannot express it.
    //
    // The type stays String rather than becoming ObjectId deliberately. It
    // points at a subdocument, not a collection, so `ref` cannot be used and
    // ObjectId would buy nothing beyond the check below, while making every
    // task document already in a database unreadable until migrated.
    status: {
      type: String,
      required: true,
      validate: {
        validator: value => /^[0-9a-f]{24}$/i.test(value),
        message: 'status must be the id of a column in this board template',
      },
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium',
    },
    color: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ColorPalette',
      required: true,
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    boardId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Board',
      required: true,
    },
    checklist: [checklistItemSchema],
    // A fractional index, not a position. It is a base 62 key chosen to sort
    // lexicographically between the keys of the two tasks it was dropped
    // between, which means moving one card writes exactly one document.
    //
    // The integer version had to renumber every task below the insertion
    // point on every drag, which is N writes for one gesture and a race the
    // moment two people reorder at once: both renumber from their own view
    // of the column and the later write silently discards the earlier one.
    //
    // The alphabet is 0-9A-Za-z, whose ASCII order is its own order, so a
    // plain Mongo sort on this field is the correct sort with no collation
    // to configure. Keys are generated server side only, in
    // task.service.js: a client sends the two neighbours it dropped between
    // and never a key of its own.
    order: {
      type: String,
      required: true,
    },
    // Set when a task is deleted, cleared when it is restored. A task with a
    // date here is invisible to every read and write path, and keeps its id,
    // its dates, its column and its `order`, so a restore puts the card back
    // exactly where it was. The purge job removes it for good once the date is
    // older than the retention window.
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Every read of a task goes through its board, and the board page reads a
// whole board sorted by ordering key, so this one index serves the busiest
// query in the product end to end: the match, the sort and the projection
// of `order` all come out of it without touching a document.
//
// It also covers the three narrower queries the ordering work added: the
// last key in a column, whether a named neighbour really sits in this column
// of this board, and the cascade that deletes a board's tasks with it.
taskSchema.index({ boardId: 1, status: 1, order: 1 });

// Serves the purge scan for tasks past retention. Partial, so the index holds
// only the few tasks currently in the deleted state.
taskSchema.index({ deletedAt: 1 }, { partialFilterExpression: { deletedAt: { $type: 'date' } } });

const Task = mongoose.model('Task', taskSchema);

export default Task;
