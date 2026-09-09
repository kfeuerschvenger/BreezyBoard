import BoardTemplate from '../../src/models/BoardTemplate.js';
import ColorPalette from '../../src/models/ColorPalette.js';

// Boards and tasks require a valid ColorPalette reference, and board
// creation optionally references a BoardTemplate. These are reference/admin
// documents normally populated by seeds/templates_and_colors.js, not created
// through the API, so they are inserted directly via the Mongoose models.
export async function seedColorsAndTemplates() {
  const boardColor = await ColorPalette.create({
    name: 'Royal Blue',
    value: '#0052CC',
    type: 'board',
  });

  const taskColor = await ColorPalette.create({
    name: 'Coral',
    value: '#FF6B6B',
    type: 'task',
  });

  const columnColor = await ColorPalette.create({
    name: 'Slate',
    value: '#64748B',
    type: 'column',
  });

  const template = await BoardTemplate.create({
    name: 'Kanban Board',
    description: 'Organize tasks in columns with drag-and-drop functionality',
    iconName: 'Folder',
    columns: [
      { title: 'Backlog', color: columnColor._id, order: 0 },
      { title: 'Done', color: columnColor._id, order: 1 },
    ],
  });

  return { boardColor, taskColor, columnColor, template };
}
