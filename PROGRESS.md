# Progress

## Pushed milestones

| Commit  | Change on origin/develop                                           |
| ------- | ------------------------------------------------------------------ |
| 7219f7e | Playable foundation                                                |
| 72aa348 | Initial court controls; horizontal mapping later superseded        |
| ca328d9 | Visible A/D mapping, net-relative W/S, per-end camera              |
| fa34e3c | PostgreSQL/Express accounts and clubhouse                          |
| 9be3cac | Persistent friends/messages and administration                     |
| 9cef07f | Authoritative online tennis, prediction, rooms/invitations and Elo |
| d9e4b15 | Pool-style Worker/D1/R2 platform and encrypted hosted recovery |
| 0ad0956 | Stable single-URL development startup with Vite |
| a8008e8 | Persisted account preferences and hosted in-match presence |

GitHub main has not been pushed or merged. Master_Prompt.txt remains untouched/untracked.

## Hosted candidate

Added Worker/D1/R2 deployment, adapting the pool's native Sites platform. Includes secure accounts, profiles/avatars, social APIs, admin, encrypted generational backup/restore, persistent authoritative tennis rooms, ready states/invitations, request-driven fixed-step physics, Elo/history and polling transport.

Strong Sites secrets are registered privately. Recovery is Windows-user encrypted in ignored .runtime/sites-secrets.dpapi. Native Node/PostgreSQL/Socket.IO remains available; development now serves one URL like pool.

## Checks

- 46 gameplay/control/presentation/prediction tests pass.
- Eight real-PostgreSQL integration tests pass, including two actual Socket.IO clients: authorization, readiness, serving/movement, malformed/replayed inputs, reconnect grace, disconnect forfeit, history and idempotent Elo.
- Bundled Worker integration passes using real SQLite through a D1 interface and R2 fixtures: accounts, forged-origin rejection, profiles/avatars, friends/messages, two-player authoritative serve/rooms, rankings/history, encrypted backup preview/restore and session invalidation.
- Vite and Worker production builds pass; Drizzle generation reports no schema drift.
- Production dependency audit: zero vulnerabilities. Drizzle Kit's schema tooling has four moderate development-only advisories.

## Limits and remaining verification

The provided browser tool fails before connecting (missing sandboxPolicy). No manual/browser movement, real browser authentication, rendered multiplayer, mobile layout, GPU profiling or cloud gameplay pass is claimed. Projection tests cover screen direction at both ends in all cameras.

Procedural/contact animation, graded timing, physical end-change rules, complete ambience, touch/gamepad support, lag compensation and measured internet-latency tuning remain. Native rooms abandon on process restart; hosted simulation progresses on requests with bounded catch-up and request-evaluated disconnect expiry.

Private Site registration/configuration is complete. Creation is not deployment success. Publication status/URL must come from the actual Sites deployment result; browser cloud verification remains separate.

## Publication verification

Sites confirmed a successful private publication at https://baseline-tennis-club.violetscout4.chatgpt.site (deployment appgdep_6b03f82f9b20819191fabfe94b4b5686, runtime environment revision 1). Production Worker error logs showed only missing favicon requests, with no application exceptions in that inspected window. Direct command-line page/health requests returned HTTP 403 before application verification; browser automation remains blocked. Consequently, cloud account/gameplay behavior is not claimed verified. Publication success and local Worker integration results are distinct checks.

Account preferences are now editable and persisted through the profile UI, and hosted presence refreshes during active play. Final publication succeeded as deployment appgdep_6b03f9296f14819181af16ba975af347 with runtime environment revision 1. Its saved version ID is appgprj_6b03f1ac62b0819188fe6bcd52921e19~appgver_e23f10319e3c8191ab9c14a3c5e96a8a. It uses Sites source commit ddf363a301ca8ef3d9a80c51bd939d6927a6bd0f, exported from GitHub develop commit a8008e8. The release archive and encrypted secret recovery stay under ignored .runtime. The original GitHub main branch is untouched.

## Run/check

```powershell
npm ci
npm run db:local
npm run db:migrate
npm run dev
npm test
npm run test:backend
npm run build:site
npm run test:hosted
```

Open http://127.0.0.1:3001. See docs/DEPLOYMENT.md for hosted build, production configuration and private administrator recovery.

Changed areas: frontend/game/input.js, camera.js, app.js, tests/movement.test.js; backend/, frontend/platform/, shared/, scripts/; hosted/, db/, drizzle/, .openai/hosting.json; package manifests and documentation.
