# Baseline Tennis

A browser-based 3D tennis game built with Three.js, Vite and vanilla JavaScript. This release is a local playable milestone: a full court/stadium, movement and rally simulation, practice, AI matches, scoring, three cameras and saved device settings. The broader online platform is still planned.

## Run locally

Requires Node.js 22+ and npm. Node 24.16.0 was used for verification.

```sh
npm ci
npm run dev -- --port 5173
```

Open http://127.0.0.1:5173/ and choose **Step onto the court**. A WebGL-capable browser with hardware acceleration is required.

```sh
npm test
npm run build
npm run preview -- --port 4173
```

The build produces `dist/`. The preview command serves the production build locally at http://127.0.0.1:4173/. No hosting publication has been configured.

## Controls

| Key       | Action                                            |
| --------- | ------------------------------------------------- |
| W / Up    | Forward, toward the net                           |
| S / Down  | Backward, toward the baseline                     |
| A / Left  | Strafe left, facing the net                       |
| D / Right | Strafe right, facing the net                      |
| Space / J | Flat swing or serve                               |
| K         | Topspin                                           |
| L         | Slice                                             |
| Shift     | Sprint                                            |
| Q / E     | Aim toward either sideline                        |
| C         | Cycle broadcast side, dynamic side, behind-player |
| Escape    | Pause/resume                                      |

Move close to the incoming ball and hold a stroke key through the contact window. Serves must bounce before returning. Movement is relative to your end of the court, facing the net, in all three camera modes. Directions automatically reverse world axes when your player changes sides, so W still approaches the net. Combine W/S with A/D for diagonal movement; diagonal speed is normalized, including while sprinting. Touch gameplay and gamepads are not implemented.

## Modes and settings

- **Match vs AI:** beginner, intermediate or advanced; quick match, single set or best of three.
- **Practice rally:** unscored rallies with AI; you serve each point.
- **Surfaces:** hard, clay and grass, with different restitution/friction. Select under Settings before starting a session.
- **Graphics:** high with soft shadows or low with reduced pixel ratio and no shadows.
- **Sound:** synthesized impact tones, volume slider and mute. Audio activates on user interaction.
- **Local profile:** completed matches, wins and best completed-match rally stored on this device. No account is needed.

Quick matches play to three games with a two-game margin and a seven-point tie-break at 3–3. Standard sets use six games and a tie-break at 6–6. All tie-breaks require a two-point margin.

## Architecture and status

Pure shared modules own simulation, AI, court dimensions and tennis scoring. Presentation, keyboard input, procedural characters, camera and audio are separate frontend modules. See [ARCHITECTURE.md](ARCHITECTURE.md) for reference findings and implementation decisions, and [PROGRESS.md](PROGRESS.md) for measured checks and limitations.

No database is required for this milestone. PostgreSQL migrations, Express APIs, authenticated Socket.IO, online rooms, ranked persistence, local two-player and social/admin screens have not been implemented. Do not connect this application to the pool database. The pool reference lives in ignored `.reference/pool` and is unchanged.
