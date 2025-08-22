import mongoose from 'mongoose';

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
    template: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BoardTemplate',
      default: null,
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

boardSchema.virtual('progress').get(async function () {
  try {
    const tasks = await mongoose.model('Task').find({ boardId: this._id });
    if (tasks.length === 0) return 0;

    const completedTasks = tasks.filter(
      task => task.status === 'done' || (task.checklist.length > 0 && task.checklist.every(item => item.completed))
    ).length;

    return Math.round((completedTasks / tasks.length) * 100);
  } catch (error) {
    console.error('Error calculating progress:', error);
    return 0;
  }
});

const Board = mongoose.model('Board', boardSchema);

export default Board;
