import mongoose from 'mongoose';
import env from '../src/config/env.js';
import BoardTemplate from '../src/models/BoardTemplate.js';
import ColorPalette from '../src/models/ColorPalette.js';

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
  // Colors for boards
  { name: 'Royal Blue', value: '#0052CC', type: 'board' },
  { name: 'Purple', value: '#6B3FA0', type: 'board' },
  { name: 'Emerald', value: '#2F9E44', type: 'board' },
  { name: 'Orange', value: '#FF9700', type: 'board' },
  { name: 'Teal', value: '#0CA678', type: 'board' },
  { name: 'Pink', value: '#F783AC', type: 'board' },
  { name: 'Amber', value: '#F08A24', type: 'board' },
  { name: 'Cyan', value: '#00B4D8', type: 'board' },

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

  // Colors for columns
  { name: 'Slate', value: '#64748B', type: 'column' },
  { name: 'Blue', value: '#3B82F6', type: 'column' },
  { name: 'Amber', value: '#F59E0B', type: 'column' },
  { name: 'Emerald', value: '#10B981', type: 'column' },
  { name: 'Violet', value: '#7C3AED', type: 'column' },
  { name: 'Orange', value: '#F97316', type: 'column' },
  { name: 'Cyan', value: '#06B6D4', type: 'column' },
  { name: 'Green', value: '#16A34A', type: 'column' },
  { name: 'Purple', value: '#8B5CF6', type: 'column' },
  { name: 'Light Blue', value: '#0EA5E9', type: 'column' },
  { name: 'Red', value: '#EF4444', type: 'column' },
  { name: 'Light Green', value: '#14B8A6', type: 'column' },
  { name: 'Indigo', value: '#6366F1', type: 'column' },
  { name: 'Dark Green', value: '#059669', type: 'column' },
  { name: 'Pink', value: '#F472B6', type: 'column' },
  { name: 'Gray', value: '#6B7280', type: 'column' },
];

const seedTemplates = [
  {
    name: 'Kanban Board',
    description: 'Organize tasks in columns with drag-and-drop functionality',
    iconName: 'Folder',
    columns: [
      { title: 'Backlog', color: '#64748B', order: 0 },
      { title: 'Up Next', color: '#3B82F6', order: 1 },
      { title: 'In Progress', color: '#F59E0B', order: 2 },
      { title: 'Done', color: '#10B981', order: 3 },
    ],
  },
  {
    name: 'Personal Planner',
    description: 'Minimal personal board to focus on daily and weekly priorities',
    iconName: 'CheckSquare',
    columns: [
      { title: 'Inbox', color: '#7C3AED', order: 0 },
      { title: 'Today', color: '#F97316', order: 1 },
      { title: 'This Week', color: '#06B6D4', order: 2 },
      { title: 'Done', color: '#16A34A', order: 3 },
    ],
  },
  {
    name: 'Product Roadmap',
    description: 'Plan product milestones and priorities across upcoming horizons',
    iconName: 'Target',
    columns: [
      { title: 'Ideas', color: '#8B5CF6', order: 0 },
      { title: 'Planned', color: '#06B6D4', order: 1 },
      { title: 'In Development', color: '#F59E0B', order: 2 },
      { title: 'Launched', color: '#14B8A6', order: 3 },
    ],
  },
  {
    name: 'Bug Tracker',
    description: 'Track and resolve bugs with clear states for QA and development',
    iconName: 'Bug',
    columns: [
      { title: 'New', color: '#EF4444', order: 0 },
      { title: 'Triaged', color: '#F97316', order: 1 },
      { title: 'Fixing', color: '#F59E0B', order: 2 },
      { title: 'Closed', color: '#10B981', order: 3 },
    ],
  },
  {
    name: 'Content Calendar',
    description: 'Coordinate content creation and publication in a simple flow',
    iconName: 'FileText',
    columns: [
      { title: 'Ideas', color: '#8B5CF6', order: 0 },
      { title: 'Assigned', color: '#3B82F6', order: 1 },
      { title: 'In Progress', color: '#F59E0B', order: 2 },
      { title: 'Published', color: '#10B981', order: 3 },
    ],
  },
  {
    name: 'Sales Pipeline',
    description: 'Visualize opportunities from initial contact through close',
    iconName: 'Phone',
    columns: [
      { title: 'Leads', color: '#6366F1', order: 0 },
      { title: 'Contacted', color: '#0EA5E9', order: 1 },
      { title: 'Proposal', color: '#F59E0B', order: 2 },
      { title: 'Closed', color: '#059669', order: 3 },
    ],
  },
  {
    name: 'Feature Requests',
    description: 'Collect, prioritize, and convert user feedback into planned work',
    iconName: 'MessageSquare',
    columns: [
      { title: 'New', color: '#64748B', order: 0 },
      { title: 'Upvoted', color: '#F472B6', order: 1 },
      { title: 'Planned', color: '#0EA5E9', order: 2 },
      { title: 'Implemented', color: '#10B981', order: 3 },
    ],
  },
  {
    name: 'Hiring Pipeline',
    description: 'Centralize candidates and keep the hiring process transparent',
    iconName: 'UserPlus',
    columns: [
      { title: 'Applicants', color: '#64748B', order: 0 },
      { title: 'Interviewing', color: '#F97316', order: 1 },
      { title: 'Offered', color: '#3B82F6', order: 2 },
      { title: 'Decision', color: '#6B7280', order: 3 },
    ],
  },
  {
    name: 'Incident Response',
    description: 'Fast, focused flow to detect, mitigate and close operational incidents',
    iconName: 'AlertTriangle',
    columns: [
      { title: 'Detected', color: '#EF4444', order: 0 },
      { title: 'Investigating', color: '#F97316', order: 1 },
      { title: 'Mitigating', color: '#F59E0B', order: 2 },
      { title: 'Resolved', color: '#10B981', order: 3 },
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
      color: colorMap.get(column.color), // Replace hex value with ObjectId
    })),
  }));

  // Insert templates
  await BoardTemplate.insertMany(templatesWithColorIds);

  console.log('Database seeded successfully');
  process.exit();
};

seed();
