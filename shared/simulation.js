import { COURT, STEP, clamp } from "./config.js";
import { newScore, awardPoint, serveCourt } from "./scoring.js";
import { ballStep, inCourt, validServe, launch } from "./physics.js";
import { aiInput } from "./ai.js";
import { movePlayer } from "./movement.js";
export function createMatch(options = {}) {
  const s = {
    time: 0,
    tick: 0,
    phase: "serve",
    surface: options.surface || "hard",
    difficulty: options.difficulty || "intermediate",
    mode: options.mode || "ai",
    score: newScore(options.format),
    ball: { x: 0, y: 2.3, z: 0, vx: 0, vy: 0, vz: 0, spin: 0 },
    players: [-1, 1].map((side) => ({
      x: 0,
      z: side * 10.8,
      side,
      vx: 0,
      vz: 0,
      swing: 0,
      cooldown: 0,
      nextThink: 0,
      decision: {},
    })),
    lastHit: 0,
    bounces: 0,
    serveFlight: false,
    netTouch: false,
    faults: 0,
    rally: 0,
    bestRally: 0,
    events: [],
    message: "Your serve",
    timer: 0,
    stats: { shots: 0, points: 0 },
  };
  prepareServe(s);
  return s;
}
export function prepareServe(s) {
  s.phase = "serve";
  s.timer = 0;
  s.bounces = 0;
  s.rally = 0;
  s.netTouch = false;
  const i = s.score.server,
    p = s.players[i],
    court = serveCourt(s.score);
  p.x = -court * 1.5 * p.side;
  p.z = p.side * 12.05;
  const r = s.players[1 - i];
  r.x = court * 1.7 * p.side;
  r.z = r.side * 10.4;
  Object.assign(s.ball, { x: p.x, y: 2.35, z: p.z, vx: 0, vy: 0, vz: 0 });
  s.message = i === 0 ? "Your serve" : "Opponent serving";
}
function point(s, w, reason) {
  if (s.mode !== "practice") awardPoint(s.score, w);
  s.phase = s.score.winner === null ? "point" : "complete";
  s.timer = 0;
  s.faults = 0;
  s.message =
    s.score.winner !== null
      ? w === 0
        ? "Match won. Well played."
        : "Match to your opponent."
      : reason;
  s.events.push({ type: "point", winner: w });
  s.stats.points++;
}
function fault(s) {
  if (++s.faults >= 2) point(s, 1 - s.score.server, "Double fault");
  else {
    prepareServe(s);
    s.message = "Fault · second serve";
    s.events.push({ type: "fault" });
  }
}
function strike(s, i, input, serve = false) {
  const b = s.ball,
    p = s.players[i],
    spin = input.shot === "topspin" ? 5 : input.shot === "slice" ? -3 : 0;
  if (
    !serve &&
    (i === s.lastHit ||
      b.y > 2.8 ||
      b.y < 0.12 ||
      Math.hypot(b.x - p.x, b.z - p.z) > 2.15 ||
      b.z * p.side < 0)
  )
    return false;
  if (!serve && s.serveFlight && s.bounces === 0) {
    point(s, 1 - i, "Serve must bounce");
    return false;
  }
  const target = {
    x: serve
      ? serveCourt(s.score) * p.side * 2.2
      : clamp((input.aim || 0) * 3.3, -3.5, 3.5),
    z: -p.side * (serve ? 4.3 : input.shot === "slice" ? 6.8 : 9.3),
  };
  launch(b, target, serve ? 3.6 : input.shot === "slice" ? 3.6 : 3.1, spin);
  s.lastHit = i;
  s.bounces = 0;
  s.serveFlight = serve;
  s.netTouch = false;
  s.phase = "rally";
  s.rally++;
  s.bestRally = Math.max(s.bestRally, s.rally);
  p.swing = 0.32;
  p.cooldown = 0.4;
  s.stats.shots++;
  s.events.push({ type: "hit", player: i, serve });
  s.message = serve
    ? "Serve in play"
    : input.shot === "topspin"
      ? "Topspin"
      : input.shot === "slice"
        ? "Slice"
        : "Clean contact";
  return true;
}
export function stepMatch(s, input = {}, dt = STEP) {
  s.events = [];
  if (s.phase === "complete") return;
  s.time += dt;
  s.tick++;
  s.timer += dt;
  if (s.phase === "point") {
    if (s.timer > 2) prepareServe(s);
    return;
  }
  for (let i = 0; i < 2; i++) {
    const p = s.players[i],
      computer = s.mode === "demo" || (i === 1 && s.mode !== "online"),
      control =
        s.mode === "online" ? input[i] || {} : computer ? aiInput(s, i) : input;
    p.swing = Math.max(0, p.swing - dt);
    p.cooldown = Math.max(0, p.cooldown - dt);
    movePlayer(p, control, dt, s.phase === "rally");
    if (s.phase === "serve" && s.score.server === i) {
      if (computer ? s.timer > 1.1 : control.swing) strike(s, i, control, true);
    } else if (s.phase === "rally" && control.swing && p.cooldown === 0) {
      if (!strike(s, i, control)) {
        p.swing = 0.2;
        p.cooldown = 0.14;
      }
    }
  }
  if (s.phase !== "rally") return;
  for (const e of ballStep(s.ball, dt, s.surface)) {
    s.events.push(e);
    if (e.type === "net") {
      s.netTouch = true;
      if (!s.serveFlight) {
        point(s, 1 - s.lastHit, "Into the net");
        return;
      }
    }
    if (e.type === "bounce") {
      s.bounces++;
      if (s.bounces === 1) {
        if (s.serveFlight) {
          if (
            !validServe(
              e.x,
              e.z,
              s.players[s.lastHit].side,
              serveCourt(s.score),
            )
          ) {
            fault(s);
            return;
          }
          if (s.netTouch) {
            prepareServe(s);
            s.message = "Let · serve again";
            return;
          }
        } else if (!inCourt(e.x, e.z) || e.z * s.players[s.lastHit].side >= 0) {
          point(s, 1 - s.lastHit, "Out");
          return;
        }
      } else {
        point(s, s.lastHit, s.serveFlight ? "Ace" : "Double bounce");
        return;
      }
    }
  }
  if (Math.abs(s.ball.z) > 19 || Math.abs(s.ball.x) > 13 || s.ball.y < -0.5) {
    if (s.serveFlight && s.bounces === 0) fault(s);
    else point(s, s.bounces > 0 ? s.lastHit : 1 - s.lastHit, "Point");
  }
}
