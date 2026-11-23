# Baseline Tennis

Three.js tennis with accounts, profiles, avatars, friends/messages, casual rooms, invitations, ranked matchmaking, persistent history, leaderboards and administration.

Like the pool reference, there are two deployments:

| Environment   | Backend/storage           | Transport                                       |
| ------------- | ------------------------- | ----------------------------------------------- |
| Native/local  | Node, Express, PostgreSQL | Socket.IO                                       |
| ChatGPT Sites | Worker, D1, R2            | Polling with persisted authoritative simulation |

Both use the same tennis simulation. Their databases, account hashes and backups are separate.

Private deployment: https://baseline-tennis-club.violetscout4.chatgpt.site. Sites confirmed publication; browser/cloud gameplay verification remains subject to the limits below.

## Start locally

Requires Node 24 and PostgreSQL 18.

```powershell
npm ci
npm run db:local
npm run db:migrate
npm run dev
```

Open **http://127.0.0.1:3001/**. One development server serves the frontend, API and Socket.IO, with Vite middleware. Use **Clubhouse** to register/sign in, or play practice/AI without an account.

The helper creates an isolated cluster under ignored .runtime/postgres on loopback port 55432, with a non-superuser application role. Existing PostgreSQL and pool data are untouched. Set PG_BIN for another binary directory, or configure .env from .env.example for your own database. Stop this project's cluster with npm run db:stop. Never delete runtime data to restart it.

Native production: npm run build, then npm start. Configure NODE_ENV=production, exact HTTPS APP_ORIGINS, TLS/WebSocket forwarding and a trusted reverse proxy. Run one Node instance per database. Separate development commands remain available as dev:client and dev:server.

## Controls

| Key       | Action                                 |
| --------- | -------------------------------------- |
| W / Up    | Toward the net                         |
| S / Down  | Away from the net                      |
| A / Left  | Strafe visibly left along court width  |
| D / Right | Strafe visibly right along court width |
| Space / J | Serve / flat                           |
| K / L     | Topspin / slice                        |
| Shift     | Sprint                                 |
| Q / E     | Aim                                    |
| C         | Cycle three cameras                    |
| Escape    | Menu; pauses local games               |

A/D follow the rendered view; W/S follow the current court end. Diagonals are normalized, including sprint. Hold a shot key within racket reach. Online play continues while menus are open; leaving forfeits an active match.

Practice is unscored. AI supports three difficulties, quick matches, single sets and best-of-three. Quick uses 3-game sets with a tie-break at 3–3; standard uses 6-game sets and 6–6. Games/sets/tie-breaks require the appropriate two-point/game margin.

## Accounts and administration

Passwords require 12–128 characters; sessions expire after seven days. HTTP and socket mutations validate authentication, origins, CSRF and permissions.

For a native admin: register normally, then run npm run admin:grant -- username. No default native password is shipped.

Sites bootstraps admin with a generated runtime secret. See [deployment/recovery](docs/DEPLOYMENT.md). Actual credentials are ignored and never committed.

Native backups are private JSON with transactional restore. Sites uses AES-GCM encrypted .tennis.enc packages, preview/password confirmation, safety backups, staged generations and R2 avatars. The formats are incompatible.

Ranked matching uses a 300-point window and Elo K=24 (equal-rated result: ±12). Only authoritative online results update persistent rankings. Local results remain on the device.

## Verification

```powershell
npm test
npm run test:backend
npm run build:site
npm run test:hosted
```

Backend integration tests need PostgreSQL and use temporary schemas. Hosted tests run the actual Worker against SQLite through a D1 interface and private R2 fixtures. Maintain hosted migrations with npm run db:generate:site.

See [architecture](ARCHITECTURE.md) and [progress](PROGRESS.md). Browser automation is currently blocked; visual controls, real browser flows and cloud latency remain unverified. Procedural animation/contact refinement and release playtesting remain.
