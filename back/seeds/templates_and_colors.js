import './requireSeedEnvironment.js';
import mongoose from 'mongoose';
import env from '../src/config/env.js';
import BoardTemplate from '../src/models/BoardTemplate.js';
import ColorPalette from '../src/models/ColorPalette.js';
import { BOARD_HUES, BOARD_HUE_NAMES } from '../src/constants/boardHues.js';

const connectDB = async () => {
  try {
    await mongoose.connect(env.MONGODB_URI);
    console.log('MongoDB connected');
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
};

const allColors = [
  // Colors for boards and columns: the six design hues, stored by key. The
  // interface derives each hue's steps from its own token layer. A column is
  // painted from the same six entries, since a hue key is unique in the palette.
  ...BOARD_HUES.map(hue => ({ name: BOARD_HUE_NAMES[hue], value: hue, type: 'board' })),

  // Colors for tasks
  { name: 'Coral', value: '#FF6B6B', type: 'task' },
  { name: 'Teal', value: '#4ECDC4', type: 'task' },
  { name: 'Aqua', value: '#45B7D1', type: 'task' },
  { name: 'Mint Green', value: '#96CEB4', type: 'task' },
  { name: 'Pale Yellow', value: '#FFEAA7', type: 'task' },
  { name: 'Mauve', value: '#DDA0DD', type: 'task' },
  { name: 'Seafoam', value: '#98D8C8', type: 'task' },
  { name: 'Sunflower', value: '#F7DC6F', type: 'task' },
  { name: 'Wisteria', value: '#BB8FCE', type: 'task' },
  { name: 'Cornflower', value: '#85C1E9', type: 'task' },
];

// A template's column colour is a hue key, replaced by the id of its palette
// entry when the template is written. The last column of each template is
// green, the hue of where work lands.
const seedTemplates = [
  {
    name: 'Kanban Board',
    description: 'Organize tasks in columns with drag-and-drop functionality',
    iconName: 'Folder',
    columns: [
      { title: 'Backlog', color: 'sky', order: 0 },
      { title: 'Up Next', color: 'lavender', order: 1 },
      { title: 'In Progress', color: 'sand', order: 2 },
      { title: 'Done', color: 'green', order: 3 },
    ],
  },
  {
    name: 'Personal Planner',
    description: 'Minimal personal board to focus on daily and weekly priorities',
    iconName: 'CheckSquare',
    columns: [
      { title: 'Inbox', color: 'lavender', order: 0 },
      { title: 'Today', color: 'sand', order: 1 },
      { title: 'This Week', color: 'teal', order: 2 },
      { title: 'Done', color: 'green', order: 3 },
    ],
  },
  {
    name: 'Product Roadmap',
    description: 'Plan product milestones and priorities across upcoming horizons',
    iconName: 'Target',
    columns: [
      { title: 'Ideas', color: 'lavender', order: 0 },
      { title: 'Planned', color: 'sky', order: 1 },
      { title: 'In Development', color: 'sand', order: 2 },
      { title: 'Launched', color: 'green', order: 3 },
    ],
  },
  {
    name: 'Bug Tracker',
    description: 'Track and resolve bugs with clear states for QA and development',
    iconName: 'Bug',
    columns: [
      { title: 'New', color: 'coral', order: 0 },
      { title: 'Triaged', color: 'sand', order: 1 },
      { title: 'Fixing', color: 'sky', order: 2 },
      { title: 'Closed', color: 'green', order: 3 },
    ],
  },
  {
    name: 'Content Calendar',
    description: 'Coordinate content creation and publication in a simple flow',
    iconName: 'FileText',
    columns: [
      { title: 'Ideas', color: 'lavender', order: 0 },
      { title: 'Assigned', color: 'sky', order: 1 },
      { title: 'In Progress', color: 'sand', order: 2 },
      { title: 'Published', color: 'green', order: 3 },
    ],
  },
  {
    name: 'Sales Pipeline',
    description: 'Visualize opportunities from initial contact through close',
    iconName: 'Phone',
    columns: [
      { title: 'Leads', color: 'lavender', order: 0 },
      { title: 'Contacted', color: 'sky', order: 1 },
      { title: 'Proposal', color: 'sand', order: 2 },
      { title: 'Closed', color: 'green', order: 3 },
    ],
  },
  {
    name: 'Feature Requests',
    description: 'Collect, prioritize, and convert user feedback into planned work',
    iconName: 'MessageSquare',
    columns: [
      { title: 'New', color: 'sky', order: 0 },
      { title: 'Upvoted', color: 'coral', order: 1 },
      { title: 'Planned', color: 'teal', order: 2 },
      { title: 'Implemented', color: 'green', order: 3 },
    ],
  },
  {
    name: 'Hiring Pipeline',
    description: 'Centralize candidates and keep the hiring process transparent',
    iconName: 'UserPlus',
    columns: [
      { title: 'Applicants', color: 'sky', order: 0 },
      { title: 'Interviewing', color: 'sand', order: 1 },
      { title: 'Offered', color: 'lavender', order: 2 },
      { title: 'Decision', color: 'green', order: 3 },
    ],
  },
  {
    name: 'Incident Response',
    description: 'Fast, focused flow to detect, mitigate and close operational incidents',
    iconName: 'AlertTriangle',
    columns: [
      { title: 'Detected', color: 'coral', order: 0 },
      { title: 'Investigating', color: 'sand', order: 1 },
      { title: 'Mitigating', color: 'sky', order: 2 },
      { title: 'Resolved', color: 'green', order: 3 },
    ],
  },
];

const seed = async () => {
  await connectDB();

  // Clear existing data
  await BoardTemplate.deleteMany();
  await ColorPalette.deleteMany();

  // Insert colors and get their IDs
  const insertedColors = await ColorPalette.insertMany(allColors);

  // Create a mapping of color values to their MongoDB IDs
  const colorMap = new Map();
  insertedColors.forEach(color => {
    colorMap.set(color.value, color._id);
  });

  // Prepare templates with color ObjectIds
  const templatesWithColorIds = seedTemplates.map(template => ({
    ...template,
    columns: template.columns.map(column => ({
      ...column,
      color: colorMap.get(column.color), // Replace hue key with ObjectId
    })),
  }));

  // Insert templates
  await BoardTemplate.insertMany(templatesWithColorIds);

  console.log('Database seeded successfully');
  process.exit();
};

seed();
