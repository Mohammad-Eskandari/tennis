# Milestone progress

## Court-relative movement update

- W/Up moves toward the net; S/Down moves toward the baseline. A/Left and D/Right strafe as the player faces the net.
- The input layer maps both axes using the controlled player's current side on each simulation tick, without reading the camera. Existing world-space AI inputs and movement/animation systems are unchanged.
- Diagonal normalization, acceleration/deceleration, sprint, shot selection and aiming retain the existing simulation behavior. The controls guide, settings dialog and README show the new mapping.
- `npm test`: 42 tests passed (29 existing and 13 new). Added real keyboard-handler/simulation coverage for every cardinal key and arrow alias at both ends, held-key side changes, all four diagonals at normal/sprint speed, camera independence across all three camera rigs, smooth acceleration/release, opposite-key cancellation, shot/aim compatibility and focus-loss cleanup.
- `npm run build`: passed. No new dependencies. Physical end-change rules remain outside this control-only change; the mapping already handles a changed player side.

## Delivered

- Phase 0: separate project, pool repository inspected, architecture documented, dependency lockfile and runnable development/build scripts.
- Phase 1: metre-based court and markings, open net, stadium terraces, instanced seats/spectators, benches, trees, PBR materials, soft shadows, broadcast side camera and articulated player placeholders.
- Phase 2 foundation: 120 Hz simulation, interpolated presentation, acceleration/deceleration, sprint, player bounds, serving, assisted racket contact, flat/topspin/slice, shot direction, ball flight/drag/bounce/net collision, rally transitions, camera switching and synthetic impact audio.
- Phase 3 foundation: service boxes, faults/double faults/lets, bounce/in-out handling, points/deuce/advantage/games/sets/tie-breaks/matches, three AI difficulties and score HUD.
- UX: session configuration, controls dialog, pause/resume, settings, three court surfaces, graphics presets, sound mute/volume, device-local profile, responsive layouts and keyboard focus styles.

## Verification

`npm test`: 29 tests passed after correcting service-box orientation and tuning AI errors. Covers legal serve trajectory, movement limits, successful and unreachable racket contact, double fault, let, practice, serve volley fault, AI rally/point lifecycle, fixed-step equivalence at 30 and 144 render FPS, gravity/bounce, swept high-speed net impact, clearance, spin, boundaries, shot continuity, long finite physics integration, points/deuce/advantage, match completion, tie-break rotation, best-of-three and service parity. Presentation tests check all three camera modes, damping, court-corner projection at desktop and portrait aspect ratios, and finite procedural character transforms without requiring WebGL.

All nine combinations of AI difficulty and surface completed deterministic quick matches in automated simulation (163–589 simulated seconds; longest rallies 4–28 shots). This verifies simulation completion, not human playability or browser performance. Local development HTTP readiness returned status 200.

`npm run build`: passed. Vite output includes a separate Three.js chunk; no build warnings. Initial `npm install` audit reported zero vulnerabilities.

Browser QA could not run: the provided browser tool failed twice before connection with `codex/sandbox-state-meta: missing field sandboxPolicy`. No screenshot, visual quality, real-browser keyboard/audio behavior, mobile interaction or GPU performance claim has been verified. Responsive CSS is implemented but still needs browser review. Local HTTP readiness is checked separately.

## Known limitations

- This is a playable milestone, not the complete production platform.
- Procedural characters and assisted contact are placeholders; graded timing, shot charging, exact animated racket contact and a complete animation state machine remain.
- Physical end changes are absent; player zero always occupies the negative-z half.
- Surface physics and aerodynamic spin are simplified. Net deflection is approximate. Ball presentation is enlarged for readability.
- No local two-player, backend, PostgreSQL schema, authentication, online rooms, prediction/reconciliation, ranked results, social features, administration or deployment.
- Audio currently covers synthesized impacts/points, not a complete stadium ambience/footstep mix.
- No gamepad or touch movement. Browser performance has not been measured.

## Next priority

Restore browser QA and playtest controls/court framing. Then refine interception, shot timing and contact-driven animation; add rules regressions for physical end changes. Complete and verify the single-player milestone before implementing Node/PostgreSQL authentication and continuous authoritative multiplayer.

## Files

Created `package.json`, `package-lock.json`, `.gitignore`, `index.html`, `vite.config.js`, `frontend/app.js`, `frontend/styles.css`, `frontend/game/{scene,character,camera,input,audio}.js`, `shared/{config,physics,scoring,ai,simulation}.js`, `tests/{physics,rules,gameplay,presentation}.test.js`, `ARCHITECTURE.md`, and `PROGRESS.md`. Updated `README.md`. Preserved the supplied `Master_Prompt.txt`.

## Milestone A: visible horizontal controls

A/D now use the rendered camera projection of the court-width axis; W/S remain net-relative. Behind-player framing follows the controlled player's side. 43 tests and production build pass, including projected on-screen direction at both ends in every camera and through transitions. Browser verification remains blocked by the browser tool connection failure (missing sandboxPolicy); no manual pass is claimed.

## Milestone B: backend foundation

Implemented backend/src config, database, security, accounts and server modules; versioned schema; local PostgreSQL helper; migration/admin commands; account/profile/avatar/password/rankings/history clubhouse UI and Vite API proxy. Five integration tests pass against real PostgreSQL, covering migration idempotence, authentication, session expiry/revocation, CSRF/origin rejection, persistence, duplicates and avatar decoding. Manual browser QA remains unavailable. Social/admin/online match behavior is next.

## Milestone C: administration and social

Added social.js and admin.js APIs; friends/request decisions/removal, accepted-friend messaging, user search/roles/suspension, health counts, audit log, JSON database export and transactional restore. Added working clubhouse screens for these APIs. Seven real-PostgreSQL tests pass, including unauthorized access, friend authorization, suspension/session revocation, and failed/successful restore. Production build passes. Presence currently requires the upcoming socket service; browser QA remains blocked. Backup exports contain password hashes and personal data and must be stored privately. Restore requires RESTORE confirmation, retains the active admin, rejects active matches, and signs out all sessions; it is a single-server maintenance tool.


## Milestones D/E: continuous online tennis and competition

Added authenticated Socket.IO room service, ready states, private-code joins, invitations, input sequencing/validation, 120 Hz server simulation and 20 Hz snapshots, 30-second disconnect grace, reconnect watch, forfeits, persisted results, Elo K=24 matchmaking within 300 points, and row-locked idempotent result updates. Frontend adds online lobby, local movement prediction/reconciliation and 100 ms remote interpolation. 46 gameplay/input/client tests and eight PostgreSQL/two-client network integration tests pass; production build passes. Runtime currently targets one Node process and marks unfinished rooms abandoned on restart. No lag-compensated contact history or measured internet-latency tuning yet. Hosted Sites adapter is next.

