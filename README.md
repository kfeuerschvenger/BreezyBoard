<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/brand/banner-dark.svg">
    <img src="docs/assets/brand/banner-light.svg" alt="BreezyBoard: Organize at the speed of wind." width="100%">
  </picture>
</p>

<p align="center">
  <a href="https://github.com/kfeuerschvenger/BreezyBoard/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/kfeuerschvenger/BreezyBoard/ci.yml?branch=main&style=flat-square&label=CI&logo=githubactions&logoColor=white" alt="CI status"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/licence-MIT-46b1e3?style=flat-square" alt="MIT licence"></a>
  <img src="https://img.shields.io/badge/Node-22-5FA04E?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node 22">
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black" alt="React 19">
  <img src="https://img.shields.io/badge/TypeScript-5.8-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript 5.8">
  <img src="https://img.shields.io/badge/MongoDB-7-47A248?style=flat-square&logo=mongodb&logoColor=white" alt="MongoDB 7">
  <img src="https://img.shields.io/badge/Docker-Compose-2496ED?style=flat-square&logo=docker&logoColor=white" alt="Docker Compose">
</p>

<p align="center"><strong>English</strong> · <a href="README_es.md">Español</a></p>

<p align="center">
  <img src="docs/assets/screens/hero.gif" alt="A card dragged from Airborne into Landed on the Kite Festival board, where it lands" width="100%">
</p>

**BreezyBoard is a Kanban board for teams who like their work to flow.**

Workspaces hold boards, boards hold columns, and columns hold cards you fling around by mouse or by keyboard.

Built where the wind never takes a day off, so nothing gets blown away: drafts survive a reload, deletes can be undone, and sessions end politely.

## Take the tour

<table>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/assets/screens/boards-overview.png" alt="The home page with a greeting, the totals and four boards">
      <p><strong>Everything at a glance.</strong> A greeting, your totals and every board you can open, each painted in its own hue.</p>
    </td>
    <td width="50%" valign="top">
      <img src="docs/assets/screens/board.png" alt="The Kite Festival board with four columns of cards">
      <p><strong>Drag it, drop it, done.</strong> Cards glide between columns with a mouse or with the keyboard alone, and land exactly where you let go.</p>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/assets/screens/task-detail.png" alt="A card open for editing with priority, owner, colour, description and checklist">
      <p><strong>Cards with pockets.</strong> Priority, owner, colour, a description and a checklist. Half-typed thoughts are kept as drafts, even through a reload.</p>
    </td>
    <td width="50%" valign="top">
      <img src="docs/assets/screens/edit-columns.png" alt="The column management dialog with rename, reorder and recolour">
      <p><strong>Your columns, your weather.</strong> Rename, reorder and recolour in one go. Two tabs editing at once? A stale save is refused rather than quietly dropping a column.</p>
    </td>
  </tr>
</table>

### Why it feels light

- **Two-level access.** Workspace admins run every board in their workspace; members see the boards they created or were added to. Nobody else sees a thing.
- **Undo for the big stuff.** A deleted board or card waits seven days in the trash before the wind takes it.
- **Sessions that slide.** Stay active and you stay signed in; walk away and the session ends after 15 minutes, with a warning first.
- **Accessible by default.** Every surface is scanned with axe and a contrast sweep on a real browser, and the budget only goes down.

Every card follows the same flight path, with a safety net underneath:

```mermaid
%%{init: {"theme": "base", "themeVariables": {"fontFamily": "Segoe UI, Helvetica, Arial, sans-serif", "primaryColor": "#cbeeff", "primaryBorderColor": "#00557e", "primaryTextColor": "#00557e", "lineColor": "#46b1e3", "textColor": "#2f7fa8", "edgeLabelBackground": "#ffffff"}}}%%
flowchart LR
  Backlog --> Rigging --> Airborne --> Landed
  Airborne -.->|delete| Trash["trash<br/>7 days to change your mind"]
  Trash -.->|restore| Airborne
  classDef sky fill:#cbeeff,stroke:#00557e,color:#00557e
  classDef lavender fill:#ede0ff,stroke:#563e7b,color:#563e7b
  classDef sand fill:#fbe5bf,stroke:#684600,color:#684600
  classDef green fill:#cff3d5,stroke:#195c2e,color:#195c2e
  classDef coral fill:#ffdcce,stroke:#7a3621,color:#7a3621
  class Backlog sky
  class Rigging lavender
  class Airborne sand
  class Landed green
  class Trash coral
```

## Under the hood

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/diagrams/architecture-dark.svg">
  <img src="docs/assets/diagrams/architecture-light.svg" alt="The browser runs the React SPA, which calls the Express API under /api/v1; the API stores data in a MongoDB replica set, avatars in an uploads volume, and sends reset mail over SMTP" width="100%">
</picture>

A React single page app talks to a layered Express API over a versioned `/api/v1`, and MongoDB runs as a replica set so a board and its cards can be deleted in one transaction. The OpenAPI contract is generated from the same Zod schemas that validate every request, so the docs cannot drift from the code.

<p align="center">
  <img src="https://skillicons.dev/icons?i=react" alt="React" title="React" width="48">&nbsp;
  <img src="https://skillicons.dev/icons?i=ts" alt="TypeScript" title="TypeScript" width="48">&nbsp;
  <img src="https://skillicons.dev/icons?i=vite" alt="Vite" title="Vite" width="48">&nbsp;
  <img src="https://skillicons.dev/icons?i=tailwind" alt="Tailwind CSS" title="Tailwind CSS" width="48">&nbsp;
  <img src="https://skillicons.dev/icons?i=nodejs" alt="Node.js" title="Node.js" width="48">&nbsp;
  <img src="https://skillicons.dev/icons?i=express" alt="Express" title="Express" width="48">&nbsp;
  <img src="https://skillicons.dev/icons?i=mongodb" alt="MongoDB" title="MongoDB" width="48">&nbsp;
  <img src="https://skillicons.dev/icons?i=docker" alt="Docker" title="Docker" width="48">&nbsp;
  <img src="https://skillicons.dev/icons?i=nginx" alt="nginx" title="nginx" width="48">&nbsp;
  <img src="https://skillicons.dev/icons?i=githubactions" alt="GitHub Actions" title="GitHub Actions" width="48">&nbsp;
  <img src="https://skillicons.dev/icons?i=vitest" alt="Vitest" title="Vitest" width="48">&nbsp;
  <img src="https://skillicons.dev/icons?i=playwright" alt="Playwright" title="Playwright" width="48">
</p>

## Quick start

All you need is Docker Desktop, running.

```bash
docker compose up -d --build
docker compose exec back npm run seed:templates
docker compose exec -e DEMO_PASSWORD=<8 characters or more> back npm run seed:demo
```

Then open http://localhost:5173 and sign in as `demo@breezyboard.local` with the password you picked. Four boards, two teammates and a kite festival are waiting.

> [!TIP]
> Reset mail lands in Mailpit at http://localhost:8025, and Swagger UI lives at http://localhost:5000/api/docs/. Everything else, from example accounts to running without Docker, is in [ENVIRONMENT.md](docs/ENVIRONMENT.md).

## Dive deeper

The README is the postcard. The deep docs are the map.

| Document | The hook |
|---|---|
| [Architecture](docs/ARCHITECTURE.md) | Backend layers, access control, the sliding session, the data model and the frontend structure |
| [Environment](docs/ENVIRONMENT.md) | Setup, every variable, the seeds and the demo, and what to check when something stalls |
| [Testing](docs/TESTING.md) | Unit tests, Playwright, the standing verify scripts and the pipeline that takes these screenshots |
| [CI](docs/CI.md) | The five jobs, the branch flow, the audit gate and the install script policy |
| [API](docs/API.md) | Authentication, conventions, error codes and rate limits |
| [Roadmap](docs/ROADMAP.md) | Ideas on the horizon, and what each one needs before it takes off |
| [openapi.yaml](docs/openapi.yaml) | The full HTTP contract, generated from the route schemas |

---

<p align="center">
  <strong>Made in Patagonia · 50°20′S</strong><br>
  Built with care (and a lot of wind) by <strong>Kevin Feuerschvenger</strong> · Software Engineer
</p>

<p align="center">
  <a href="https://github.com/kfeuerschvenger"><img src="https://img.shields.io/badge/GitHub-kfeuerschvenger-181717?style=flat-square&logo=github&logoColor=white" alt="GitHub"></a>
  <a href="https://www.linkedin.com/in/kevin-feuerschvenger/"><img src="https://img.shields.io/badge/LinkedIn-kevin--feuerschvenger-0A66C2?style=flat-square&logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI%2BPHBhdGggZmlsbD0id2hpdGUiIGQ9Ik0yMC40NSAyMC40NWgtMy41NnYtNS41N2MwLTEuMzMtLjAyLTMuMDQtMS44NS0zLjA0LTEuODUgMC0yLjE0IDEuNDUtMi4xNCAyLjk0djUuNjdIOS4zNVY5aDMuNDF2MS41NmguMDVjLjQ4LS45IDEuNjQtMS44NSAzLjM3LTEuODUgMy42IDAgNC4yNyAyLjM3IDQuMjcgNS40NnY2LjI4ek01LjM0IDcuNDNhMi4wNiAyLjA2IDAgMSAxIDAtNC4xMyAyLjA2IDIuMDYgMCAwIDEgMCA0LjEzek03LjEyIDIwLjQ1SDMuNTZWOWgzLjU2djExLjQ1eiIvPjwvc3ZnPg%3D%3D" alt="LinkedIn"></a>
  <a href="https://feuerschvenger.com/"><img src="https://img.shields.io/badge/Portfolio-feuerschvenger.com-00557e?style=flat-square&logo=googlechrome&logoColor=white" alt="Portfolio"></a>
</p>

<p align="center"><sub>Released under the <a href="LICENSE">MIT licence</a>.</sub></p>
