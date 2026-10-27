# Standing verification scripts

Scripts that drive the running stack and assert what a unit test structurally cannot see: a real browser, real time, a real database and the production CSP.

What each script asserts, how to run it, and the special setups for `idle.mjs` and `csp.mjs` are documented in [docs/TESTING.md](../../docs/TESTING.md#standing-verify-scripts).

```mermaid
%%{init: {"theme": "base", "themeVariables": {"fontFamily": "Segoe UI, Helvetica, Arial, sans-serif", "primaryColor": "#cbeeff", "primaryBorderColor": "#00557e", "primaryTextColor": "#00557e", "lineColor": "#46b1e3", "textColor": "#2f7fa8"}}}%%
flowchart LR
  Stack["development stack<br/>docker compose up -d"] --> Verify["npm run verify<br/>from e2e/"]
  Prod["production stack"] --> Csp["npm run verify:csp"]
  Short["stack with a short<br/>inactivity window"] --> Idle["npm run verify:idle"]
```

Quick run, from `e2e/` with the development stack up and the reference data seeded:

```bash
npm run verify
```
