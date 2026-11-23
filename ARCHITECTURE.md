# Architecture

## Pool reference

Inspected Mohammad-Eskandari/pool at 3a53861ae7cf7a8ba06788f3b39cfb9e32285bb3; the ignored reference checkout is unchanged.

The native pool app separates rendering/input from shared simulation, uses session/CSRF authentication for HTTP and sockets, validates participants, and applies results with PostgreSQL transactions. Its hosted-app is a separate Sites Worker with D1/R2, polling, PBKDF2 passwords, generational storage and encrypted maintenance.

Baseline retains vanilla ES modules, Vite, Three.js, Node/Express/PostgreSQL and Socket.IO. Continuous tennis movement/flight/scoring replaces pool shot replay.

The Sites core/accounts/social/maintenance modules, schema/migrations and harness are adapted from the user's pool hosted application. Cookies, password policy, profile rating alias, backup format and game validation are adapted for tennis. Compatibility command/event-history tables remain in that platform schema. No pool physics, ball rack or shot-replay game is used.

## Gameplay and presentation

shared/config.js centralizes metres, surfaces, AI and 120 Hz timestep. physics.js owns gravity, drag, approximate Magnus force, net sweeps, bounces and boundaries; scoring.js owns real tennis scoring. movement.js provides normalized motion, acceleration, deceleration, sprint and bounds for both authority and prediction. simulation.js owns serve/rally/point/complete phases and accepts two human inputs in online mode. ai.js uses delayed approximate interception and deterministic mistakes.

World x spans sidelines, z spans baselines and y is height. W/S follow the current end. The camera projects a small x offset at the player to determine visible right for A/D, including transitions. Behind-player framing follows the player's end.

frontend/game separates scene, camera, input, procedural animation and audio. frontend/platform separates account/social/admin/lobby UI, API security, prediction and transport. Local movement prediction uses two 120 Hz steps per 60 Hz command. Snapshots acknowledge inputs, replay pending movement and interpolate remote players/ball in a 100 ms buffer.

## Native backend

backend/src contains config, database, security, accounts, social, admin, multiplayer and results. Development serves Vite middleware, APIs and Socket.IO at one URL; production serves built assets.

PostgreSQL migrations use an advisory transaction lock. Passwords use Argon2id; random session tokens are hashed, expiring and carried in HttpOnly SameSite cookies, Secure in production. Origins, CSRF, roles, bounded payloads/uploads and rate limits protect mutations.

One Node process runs 120 Hz simulation and 20 Hz snapshots. Clients send bounded sequenced inputs, never positions/results. Old input expires after 250 ms; reconnect grace is 30 seconds. Row-locked transactional result processing prevents duplicate wins/rating changes. Native unfinished rooms are abandoned on restart.

Native backups use repeatable-read JSON export and parameterized transactional restoration, retaining the active administrator and invalidating sessions. Restore refuses active matches. This is simpler than hosted generation-based recovery.

## Sites backend

.openai/hosting.json declares DB (D1) and BUCKET (R2). scripts/build-hosted.mjs embeds the Vite assets into dist/server/index.js. Root Drizzle schema and migration metadata are included for Sites migration application.

Workers are request-driven. The hosted adapter coalesces inputs around 20 Hz and advances persisted state with the shared 120 Hz simulation from server elapsed time, capped at 60 catch-up steps. Inputs, acknowledgements, timestamps, ready states and tennis state persist. Optimistic revisions and guarded atomic batches prevent lost updates and duplicate results. Unique seats prevent concurrent rooms for one player. Disconnect expiry runs when requests arrive.

Hosted passwords use salted PBKDF2-SHA256 with 600,000 iterations. Secure sessions, same-origin/CSRF and roles protect APIs. R2 holds private avatars and encrypted backups. AES-GCM backups include versioned records/checksums; restoration stages data and avatar generations, verifies integrity and atomically switches generation.

Sites polling is an adaptation to the same deployment constraints as pool. It is not a persistent Socket.IO process or a measured competitive-latency guarantee. Native PostgreSQL and hosted D1 data/passwords/backups are separate.

## Remaining limits

Contact uses an assisted 2.15 m region; procedural strokes do not ensure exact racket-surface contact. Graded timing, charged power, physical end changes, full animation blending/ambience, touch/gamepads, lag-compensated history, multi-node scaling and performance profiling remain. Browser and cloud playtesting are separate from logic/storage/deployment checks.
