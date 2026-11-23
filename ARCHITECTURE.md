# Baseline architecture

## Reference inspection

Inspected `Mohammad-Eskandari/pool` at commit `3a53861ae7cf7a8ba06788f3b39cfb9e32285bb3`, cloned into ignored `.reference/pool`. The original remains unchanged.

- `frontend/game.js` uses requestAnimationFrame for input, physics, cue animation, camera, widgets and rendering. `camera.js` owns a camera rig independent of cue direction, while `input.js` filters editable targets and cancels gestures on interruption. `workspace.js` separates responsive navigation from the match view.
- `shared/physics.js` and `shared/rules.js` expose simulation independent of WebGL. Match state has phases, a revision and explicit events. `frontend/match-sync.js` rejects stale and duplicate revisions, including regressions from terminal states.
- `backend/src/matches.js` checks participation and eligibility, locks matches and users, validates shot parameters, and uses `sim-worker.js` for complete authoritative discrete-shot simulation. Results and ranking changes use transactions and `result_applied` for idempotence.
- `server.js` authenticates sockets from sessions and handshake CSRF, joins authenticated user and authorized match rooms, bounds messages, and periodically checks sessions. `security.js` uses Argon2id password verification, hashed random session tokens, expiry, secure cookie policy, origin checks and CSRF protection. These are patterns to retain, not evidence that the tennis application already has authentication.
- `db.js` provides PostgreSQL pools and transactions; `migrate.js` takes an advisory transaction lock and records ordered SQL migrations. Maintenance also supports versioned storage generations and validated backups. These pool-specific schemas must not be copied into tennis unchanged.
- Root commands cover Vite builds, Node tests, backend bootstrap tests, database setup/migration and integration/browser tests. Development and production are served through Express in the reference. Tennis currently uses Vite directly for its local milestone.

## Decisions

Retain vanilla JavaScript ES modules, Three.js and Vite, with Node's built-in test runner. No gameplay library or UI framework is necessary for this milestone. The reference's discrete shot worker and replay stream cannot model continuous tennis; physics, controls, cameras, scoring and AI are new implementations. No reference source or third-party character assets have been copied.

## Implemented boundaries

| Module                       | Responsibility                                                                                                                                        |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shared/config.js`           | Metre-based dimensions, 120 Hz step, surface and AI presets                                                                                           |
| `shared/physics.js`          | Drag, gravity, tunable vertical Magnus approximation, ballistic shot initialization, swept net-plane tests, bounce events, line and service decisions |
| `shared/scoring.js`          | Points, deuce, advantage, games, sets, tie-break service rotation and match completion                                                                |
| `shared/simulation.js`       | Match phase machine, movement, contact eligibility, serve/let/fault handling, scoring integration                                                     |
| `shared/ai.js`               | Delayed decisions, approximate intercept, recovery, deterministic placement and errors                                                                |
| `frontend/game/scene.js`     | PBR court and stadium, instanced seats/crowd, lighting, graphics quality, disposal                                                                    |
| `frontend/game/character.js` | Original procedural humanoids, articulated gait, stroke animation and rackets                                                                         |
| `frontend/game/camera.js`    | Broadcast default, damped dynamic side tracking/zoom, optional behind-player                                                                          |
| `frontend/game/input.js`     | Keyboard state, editable-target filtering and focus-loss cleanup                                                                                      |
| `frontend/game/audio.js`     | Gesture-activated Web Audio impact tones                                                                                                              |
| `frontend/app.js`            | Local session UI, fixed-step accumulator, render interpolation, HUD, pause, preferences and local statistics                                          |

World `x` spans sidelines, `z` spans baselines and `y` is height. Player zero occupies negative z. Broadcast camera sits on the negative-x sideline so positive z moves right on screen. Movement is court-relative in all camera modes. Physics uses the regulation ball radius; its rendered radius is deliberately enlarged for broadcast readability.

The renderer interpolates the previous/current fixed simulation positions. Frame time is capped at 100 ms to bound catch-up after stalls. Hidden tabs pause active matches. AI choices use simulation time and a stable per-shot sample rather than wall-clock randomness, enabling reproducible tests.

## Current approximations

Racket contact uses a 2.15 m assistance region, ball height, opposite last hitter, player half, shot selection and cooldown. Holding a key repeats attempts; charged power and graded early/perfect/late timing are not implemented. Stroke animations are procedural placeholders and do not yet guarantee exact racket-surface contact. Gravity and net sweeps are tested; ground impacts use interpolated contact coordinates and rebound at the end of the step. Spin is a tunable vertical-force approximation, not a full 3-axis aerodynamic model. Net serves that land legally replay as lets; net deflection is simplified.

Players retain their visible ends to keep controls consistent. Scoring rotates service correctly but physical end changes are not implemented. Practice is an endless unscored session against AI, with player zero serving each new point. Match formats use a seven-point, win-by-two tie-break, including deciding sets. Quick uses three games, two-game margin and tie-break at 3–3; standard uses six and 6–6.

## Planned server architecture (not implemented)

Keep Node/Express, PostgreSQL and Socket.IO compatibility. Move this same simulation into long-lived authoritative match workers. Start with 120 Hz simulation and 20–30 Hz snapshots, then measure; do not spawn a worker per stroke. Commands must carry monotonic input sequence and bounded fields, never ball positions or scores. Server acknowledgements enable local movement reconciliation; interpolate remote players/ball behind server time. Add bounded history for contact compensation only after latency tests.

Adapt the reference's Argon2id sessions, CSRF/socket origins, participant checks, replay protection, reconnect grace and row-locked idempotent result transactions. Create tennis migrations independently. No backend, database, authentication, room lifecycle, ranking, social or administration service is exposed by this milestone. Browser storage is local convenience data, never authoritative ranked data.

## Assets and replacement

Court, geometry, characters and sound tones are generated in code. Font styling optionally loads DM Sans and Manrope from Google Fonts; system sans-serif fallback works offline. Replace `createPlayer()` with a licensed rigged model behind its current `update(player,time)` interface. Add clip blending and contact-driven racket animation before treating the characters as final assets.
