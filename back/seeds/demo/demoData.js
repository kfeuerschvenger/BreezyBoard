/**
 * The content of the demo workspace: people, boards, columns and cards.
 *
 * Plain data with no database access, so the seed and its test read the same
 * description. Everything here is invented: the people, the places and the
 * product are fictional.
 */

/** The moment every timestamp in the demo is counted from. A fixed instant, never the clock. */
export const ANCHOR = Date.UTC(2026, 2, 2, 9, 0, 0);

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** How long after the anchor a board is created, and how far apart its cards are. */
export const boardOffset = index => index * 2 * DAY;
export const taskOffset = (boardIndex, taskIndex) => boardOffset(boardIndex) + HOUR + taskIndex * 3 * HOUR;

/** The address that identifies the demo account. The seed owns this and the teammates' addresses, nothing else. */
export const DEMO_EMAIL = 'demo@breezyboard.local';

export const DEMO_WORKSPACE_NAME = 'Windward Studio';

/**
 * A round avatar as a self-contained SVG data URI: the initials in white on a
 * diagonal gradient. Stored in the account itself, so the demo needs no file
 * on disk and no request to a third party.
 */
const avatarOf = (initials, from, to) => {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 150">' +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>` +
    '<rect width="150" height="150" fill="url(#g)"/>' +
    `<text x="75" y="75" dy="0.35em" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="58" font-weight="700" fill="#ffffff">${initials}</text>` +
    '</svg>';

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
};

/** The demo account first, then the teammates cards are assigned to. */
export const DEMO_PEOPLE = [
  { key: 'ada', firstName: 'ada', lastName: 'gale', email: DEMO_EMAIL, role: 'Admin', department: 'Management', location: 'Bariloche', avatar: avatarOf('AG', '#46b1e3', '#00557e') },
  { key: 'leo', firstName: 'leo', lastName: 'zephyr', email: 'leo.zephyr@breezyboard.local', role: 'Developer', department: 'Engineering', location: 'El Calafate', avatar: avatarOf('LZ', '#2fc4b8', '#0b5f6b') },
  { key: 'nora', firstName: 'nora', lastName: 'windham', email: 'nora.windham@breezyboard.local', role: 'Designer', department: 'Creative', location: 'Ushuaia', avatar: avatarOf('NW', '#a98cf0', '#4b3394') },
];

/**
 * Boards, in the order the dashboard lists them. Each one is built from the
 * named template, so it carries the template's icon, and then names its own
 * columns. The last column of every board is where work lands, and is green.
 *
 * A card is `[title, column index, priority, owner key or null, options]`.
 * `options.description` is its text and `options.checklist` its items, each
 * `[text, completed]`.
 */
export const DEMO_BOARDS = [
  {
    key: 'kites',
    title: 'Kite Festival 2026',
    description: 'Three days on the beach, forty kites and one very opinionated gust forecast.',
    hue: 'sky',
    template: 'Kanban Board',
    columns: [
      ['Backlog', 'sky'],
      ['Rigging', 'lavender'],
      ['Airborne', 'sand'],
      ['Landed', 'green'],
    ],
    tasks: [
      ['Book the beach permit before the windy season', 0, 'high', 'ada', { description: 'The office closes at noon, and so does the wind.' }],
      ['Print wind-direction banners', 0, 'low', 'nora'],
      ['Order forty spare spools of line', 0, 'medium', 'leo'],
      [
        'Tie down the kites before the 60 km/h gust',
        1,
        'high',
        'ada',
        {
          description: 'Anchor stakes, double knots on every bridle, and a firm word with the ice cream stand.',
          checklist: [
            ['Check every anchor stake', true],
            ['Double-knot each bridle', true],
            ['Move the ice cream stand upwind', false],
            ['Hold a very firm hat meeting', false],
          ],
        },
      ],
      ['Sew the festival windsock', 1, 'medium', 'nora'],
      ['Test the stunt kite quad lines', 1, 'medium', 'leo'],
      [
        'Run the opening parade of dragon kites',
        2,
        'high',
        'ada',
        {
          checklist: [
            ['Brief the drummers', true],
            ['Mark the parade route with flags', true],
            ['Keep the dragons apart from the sheep', false],
          ],
        },
      ],
      ['Live-stream the sunset fly-over', 2, 'low', 'leo'],
      ['Print the volunteer shirts', 3, 'medium', 'nora'],
      ['Confirm the field with the sheep', 3, 'low', 'ada'],
      ['Pick a festival playlist (no whistling)', 3, 'low', 'leo'],
      ['Hire the first-aid tent', 3, 'medium', 'nora'],
      ['Reserve the portable stage', 3, 'high', 'ada'],
    ],
  },
  {
    key: 'patagonia',
    title: 'Patagonia Road Trip',
    description: 'Two thousand kilometres of gravel, glaciers and headwind.',
    hue: 'teal',
    template: 'Personal Planner',
    columns: [
      ['Dreaming', 'lavender'],
      ['Booked', 'sky'],
      ['On the Road', 'sand'],
      ['Arrived', 'green'],
    ],
    tasks: [
      ['Pack three jackets, then a fourth', 0, 'medium', 'ada'],
      ['Learn to ask where the wind goes', 0, 'low', 'nora', { description: 'Spoken Spanish for "it is only a breeze".' }],
      [
        'Book the refugio in the national park',
        1,
        'high',
        'ada',
        {
          checklist: [
            ['Pick the dates the wind is on holiday', true],
            ['Send the deposit', true],
            ['Confirm the vegetarian dinner', false],
          ],
        },
      ],
      ['Rent a car that survives gravel', 1, 'high', 'leo'],
      ['Buy a hat with a chin strap', 1, 'medium', 'ada'],
      ['Cross Ruta 40 with a full tank', 2, 'high', 'leo'],
      ['Photograph the glacier before it calves', 2, 'medium', 'ada'],
      ['Refill the mate thermos at every stop', 2, 'low', 'nora'],
      ['Land in El Calafate', 3, 'medium', 'ada'],
      ['Watch the condors ride the updraft', 3, 'low', 'nora'],
      ['Find lip balm that survives the wind', 3, 'low', 'leo'],
      ['Taste the lamb asado, for research', 3, 'medium', 'ada'],
    ],
  },
  {
    key: 'launch',
    title: 'Product Launch: Gustly v2',
    description: 'The second release of a weather app that is never wrong, only early.',
    hue: 'lavender',
    template: 'Product Roadmap',
    columns: [
      ['Ideas', 'lavender'],
      ['Planned', 'sky'],
      ['In Development', 'sand'],
      ['Landed', 'green'],
    ],
    tasks: [
      ['Explore a gust-alert widget', 0, 'low', 'nora'],
      ['Ship v2 before the wind changes', 1, 'high', 'ada', { description: 'Code freeze on Thursday. The forecast says Friday.' }],
      ['Write the changelog nobody will read', 1, 'low', 'leo'],
      [
        'Fix the gust-detection rounding bug',
        2,
        'high',
        'leo',
        {
          checklist: [
            ['Reproduce it with a 59.9 km/h reading', true],
            ['Write the failing test', true],
            ['Round toward the safe side', false],
          ],
        },
      ],
      ['Dark launch to five percent of breezes', 2, 'medium', 'ada'],
      ['Redesign the pricing page', 2, 'medium', 'nora'],
      ['Record the demo video', 3, 'low', 'nora'],
      ['Migrate the legacy sail data', 3, 'medium', 'leo'],
      ['Announce the beta to the weather vanes', 3, 'low', 'ada'],
      ['Tag the release candidate', 3, 'medium', 'leo'],
      ['Publish the docs', 3, 'medium', 'nora'],
    ],
  },
  {
    key: 'home',
    title: 'Home Tune-up',
    description: 'Small repairs, ahead of the first storm of the season.',
    hue: 'sand',
    template: 'Personal Planner',
    columns: [
      ['Inbox', 'lavender'],
      ['Today', 'sand'],
      ['This Week', 'teal'],
      ['Tuned', 'green'],
    ],
    tasks: [
      ['Seal the window that whistles', 0, 'high', 'ada'],
      ['Bleed the radiators', 0, 'low', null],
      ['Clear the gutters before the storm', 1, 'high', 'ada', { checklist: [['Borrow the tall ladder', true], ['Hold the ladder steady', false]] }],
      ['Re-hang the squeaky door', 1, 'medium', null],
      ['Fix the wobbly chair', 2, 'low', null],
      ['Oil the garden gate', 2, 'low', 'leo'],
      ['Replace the smoke detector battery', 3, 'medium', 'ada'],
      ['Tie down the garden furniture', 3, 'medium', null],
      ['Hang the wind chimes, at last', 3, 'low', 'ada'],
      ['Stop the shed door from slamming', 3, 'low', null],
    ],
  },
];
