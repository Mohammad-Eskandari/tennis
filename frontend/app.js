import "./styles.css";
import { createClubhouse } from "./platform/clubhouse.js";
import "./platform/styles.css";
import { OnlineMatch } from "./platform/online-match.js";
import { createScene } from "./game/scene.js";
import { CameraRig, CAMERA_MODES } from "./game/camera.js";
import { Input } from "./game/input.js";
import { Audio } from "./game/audio.js";
import { createMatch, stepMatch } from "../shared/simulation.js";
import { pointLabel } from "../shared/scoring.js";
import { STEP } from "../shared/config.js";
const $ = (id) => document.getElementById(id);
const icons = {
  ball: '<circle cx="12" cy="12" r="9"/><path d="M5 5c8 0 14 6 14 14M5 19C5 11 11 5 19 5"/>',
  play: '<path d="m9 5 11 7-11 7Z"/>',
  settings: '<path d="M4 7h16M4 17h16M9 3v8m6 2v8"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  camera:
    '<rect x="3" y="6" width="18" height="14" rx="3"/><circle cx="12" cy="13" r="4"/><path d="m8 6 2-3h4l2 3"/>',
  sound: '<path d="m11 4-6 5H2v6h3l6 5ZM15 8q6 4 0 8m3-12q10 8 0 16"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
};
const icon = (n) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[n]}</svg>`;
const movementGuide = () =>
  `<div class="control-list" aria-label="Movement controls"><span><kbd>W / UP</kbd> Forward · toward the net</span><span><kbd>S / DOWN</kbd> Backward · toward the baseline</span><span><kbd>A / LEFT</kbd> Strafe left</span><span><kbd>D / RIGHT</kbd> Strafe right</span></div><p class="muted">W/S follow your end of the court. A/D strafe visibly left/right in the current camera, including after changing ends. Combine keys to move diagonally. Hold Shift to sprint.</p>`;
document.querySelector("#app").innerHTML = `
 <header><a class="brand" href="./">${icon("ball")}<span>baseline<span class="brand-dot">.</span></span></a><nav aria-label="Main"><button class="nav-active" id="play-nav">The court</button><button id="how-nav">How to play</button><button id="settings-nav">Settings</button></nav><span class="edition">TENNIS, REIMAGINED</span><button class="avatar" id="profile" aria-label="View local player stats">YOU</button></header>
 <main><canvas id="court" aria-label="3D tennis court" tabindex="0"></canvas><div class="vignette"></div>
 <div class="venue"><span class="eyebrow">THE BASELINE CLUB</span><span>Centre Court <span class="dot-separator">/</span> <span id="surface-label">Hard court</span></span></div>
 <section id="welcome" class="welcome"><div class="eyebrow"><span class="tiny-line"></span> A FRESH PERSPECTIVE ON TENNIS</div><h1>The court<br>is <em>yours.</em></h1><p>Find your rhythm. Chase the lines.<br>Make every point your own.</p><div class="match-config"><label>YOUR SESSION<select id="mode"><option value="ai">Match vs AI</option><option value="practice">Practice rally</option></select></label><div class="config-row"><label>OPPONENT<select id="difficulty"><option value="beginner">Beginner</option><option value="intermediate" selected>Intermediate</option><option value="advanced">Advanced</option></select></label><label>FORMAT<select id="format"><option value="quick">Quick match</option><option value="set">Single set</option><option value="best3">Best of three</option></select></label></div><button class="primary" id="start">${icon("play")} Step onto the court</button><small>QUICK MATCH · FIRST TO 3 GAMES, WIN BY 2</small></div><div class="local-note"><span class="status-dot"></span> Local play. No account needed.</div></section>
 <div class="court-label" id="court-caption"><span>01 / CENTRE COURT</span><strong>A different kind of court time.</strong><span>23.77 × 10.97 M &nbsp; · &nbsp; OPEN AIR</span></div>
 <section id="hud" class="hud" hidden aria-label="Match scoreboard"><div class="score-title"><span id="match-type">EXHIBITION</span><span>SETS &nbsp; GAMES &nbsp; PTS</span></div><div class="score-row"><span id="server0" class="serve-dot"></span><strong>You</strong><span id="sets0">0</span><span id="games0">0</span><b id="points0">0</b></div><div class="score-row"><span id="server1" class="serve-dot"></span><strong>Club opponent</strong><span id="sets1">0</span><span id="games1">0</span><b id="points1">0</b></div><div class="score-foot"><span id="rally">READY TO PLAY</span><span id="clock">00:00</span></div></section>
 <div id="feedback" class="feedback" role="status" hidden></div><div id="serve-hint" class="serve-hint" hidden><kbd>SPACE</kbd><span>Serve when you're ready</span></div>
 <div class="scene-actions"><button id="camera" class="glass-button">${icon("camera")} <span id="camera-label">Broadcast side</span><kbd>C</kbd></button><button id="sound" class="glass-button icon-button" aria-label="Mute sound" aria-pressed="false">${icon("sound")}</button><button id="pause" class="glass-button icon-button" aria-label="Pause match" hidden>${icon("pause")}</button></div>
 <div class="court-badge"><span class="badge-ball">◌</span> MADE FOR THE LOVE OF THE GAME</div>
 </main><footer><div class="footer-title"><span class="status-dot"></span><strong id="footer-state">Your next great rally starts here.</strong></div><div class="key-guide"><span><kbd>W A S D</kbd> Move</span><span><kbd>SPACE</kbd> Swing</span><span><kbd>J K L</kbd> Shot</span><button id="controls">All controls</button></div></footer>
 <dialog id="dialog"><div class="dialog-head"><span class="eyebrow" id="dialog-eyebrow">BASELINE CLUB</span><button id="close-dialog" class="plain-icon" aria-label="Close dialog">${icon("close")}</button></div><div id="dialog-content"></div></dialog>`;
let saved = {};
try {
  saved = JSON.parse(localStorage.getItem("baseline-settings") || "{}");
} catch {}
if (!saved || typeof saved !== "object" || Array.isArray(saved)) saved = {};
if (!["hard", "clay", "grass"].includes(saved.surface)) saved.surface = "hard";
if (typeof saved.volume !== "number" || !Number.isFinite(saved.volume))
  saved.volume = 0.3;
saved.volume = Math.max(0, Math.min(1, saved.volume));
let stats = { matches: 0, wins: 0, best: 0 };
try {
  stats = {
    ...stats,
    ...JSON.parse(localStorage.getItem("baseline-stats") || "{}"),
  };
} catch {}
for (const key of ["matches", "wins", "best"]) {
  if (!Number.isSafeInteger(stats[key]) || stats[key] < 0) stats[key] = 0;
}
let state = createMatch({ mode: "demo" }),
  active = false,
  paused = false,
  recorded = false,
  acc = 0,
  last = performance.now();
let scene;
try {
  scene = createScene($("court"));
} catch (e) {
  $("welcome").innerHTML =
    "<h1>WebGL unavailable</h1><p>Enable hardware acceleration and reload to play Baseline.</p>";
  throw e;
}
const rig = new CameraRig(),
  audio = new Audio();
audio.volume = saved.volume ?? 0.3;
audio.enabled = saved.sound !== false;
scene.setQuality(saved.quality === "low");
function save() {
  try {
    localStorage.setItem("baseline-settings", JSON.stringify(saved));
  } catch {}
}
function camera() {
  rig.cycle();
  $("camera-label").textContent = CAMERA_MODES[rig.mode];
  if (active) $("court").focus();
}
const input = new Input((action) => {
  if (action === "camera") camera();
  if (action === "pause" && active) pause();
});
function showDialog(html, eyebrow = "BASELINE CLUB") {
  paused = active;
  input.clear();
  $("dialog-eyebrow").textContent = eyebrow;
  $("dialog-content").innerHTML = html;
  $("dialog").showModal();
}
function closeDialog() {
  $("dialog").close();
  paused = false;
  input.clear();
  $("court").focus();
}
$("close-dialog").onclick = closeDialog;
$("dialog").addEventListener("cancel", (e) => {
  e.preventDefault();
  closeDialog();
});
function how() {
  showDialog(
    `<h2>Find your rhythm.</h2><p>Move into the ball's path, then hold a shot key to swing as it enters racket reach.</p>${movementGuide()}<div class="control-list"><span><kbd>SPACE / J</kbd> Flat shot / serve</span><span><kbd>K / L</kbd> Topspin / slice</span><span><kbd>Q / E</kbd> Aim left / right</span><span><kbd>C</kbd> Cycle camera</span><span><kbd>ESC</kbd> Pause / resume</span></div><p class="muted">Get within 2.15 m of the ball. A serve must bounce before a return. Quick matches play to 3 games with a two-game margin and a tie-break at 3–3. Other formats play 6-game sets.</p>`,
    "THE PLAYBOOK",
  );
}
$("how-nav").onclick = how;
$("controls").onclick = how;
function settings() {
  showDialog(
    `<h2>Make it your court.</h2><label class="setting">Court surface<select id="surface"><option value="hard">Hard court</option><option value="clay">Clay</option><option value="grass">Grass</option></select></label><label class="setting">Graphics<select id="quality"><option value="high">High · soft shadows</option><option value="low">Low · performance</option></select></label><label class="setting">Effects volume<input id="volume" type="range" min="0" max="1" step=".05" value="${audio.volume}"></label><p class="muted">Surface changes apply to your next session. Settings are saved on this device.</p><h3>Movement controls</h3>${movementGuide()}`,
    "PREFERENCES",
  );
  $("surface").value = saved.surface || "hard";
  $("quality").value = saved.quality || "high";
  $("surface").onchange = (e) => {
    saved.surface = e.target.value;
    save();
    if (!active) {
      scene.setSurface(saved.surface);
      $("surface-label").textContent = e.target.selectedOptions[0].textContent;
    }
  };
  $("quality").onchange = (e) => {
    saved.quality = e.target.value;
    scene.setQuality(saved.quality === "low");
    save();
  };
  $("volume").oninput = (e) => {
    audio.activate();
    audio.volume = Number(e.target.value);
    saved.volume = audio.volume;
    save();
  };
}
$("settings-nav").onclick = settings;
function pause() {
  if ($("dialog").open) {
    closeDialog();
    return;
  }
  showDialog(
    `<h2>A moment to reset.</h2><p>${onlineClient ? "Online play continues while this menu is open. Leaving an active match forfeits it." : "Your match is paused. Take a breath, then get back out there."}</p><button class="primary" id="resume">Resume match</button><button class="secondary" id="leave">Return to clubhouse</button>`,
    "CHANGEOVER",
  );
  $("resume").onclick = closeDialog;
  $("leave").onclick = async () => {
    if (onlineClient) {
      try {
        await onlineClient.leave();
        onlineClient = null;
      } catch (e) {
        $("dialog-content").insertAdjacentHTML(
          "beforeend",
          '<p role="alert">Could not leave the room. Check your connection and retry.</p>',
        );
        return;
      }
    }
    closeDialog();
    active = false;
    state = createMatch({ mode: "demo", surface: saved.surface });
    $("welcome").hidden = false;
    $("court-caption").hidden = false;
    $("hud").hidden = true;
    $("pause").hidden = true;
    $("serve-hint").hidden = true;
    $("feedback").hidden = true;
  };
}
$("pause").onclick = pause;
$("camera").onclick = camera;
$("sound").onclick = () => {
  audio.activate();
  audio.enabled = !audio.enabled;
  saved.sound = audio.enabled;
  save();
  $("sound").setAttribute("aria-pressed", String(!audio.enabled));
  $("sound").setAttribute(
    "aria-label",
    audio.enabled ? "Mute sound" : "Enable sound",
  );
  $("sound").style.opacity = audio.enabled ? "1" : ".5";
  if (active) $("court").focus();
};
$("profile").onclick = () =>
  showDialog(
    `<h2>Your court time.</h2><p>Local player · saved on this device</p><div class="stats"><div><strong>${stats.matches}</strong><span>Matches played</span></div><div><strong>${stats.wins}</strong><span>Matches won</span></div><div><strong>${stats.best}</strong><span>Best rally</span></div></div>`,
    "PLAYER PROFILE",
  );
$("play-nav").onclick = () => {
  if (active) pause();
  else $("start").focus();
};
$("start").onclick = () => {
  audio.activate();
  active = true;
  paused = false;
  recorded = false;
  input.clear();
  state = createMatch({
    mode: $("mode").value,
    difficulty: $("difficulty").value,
    format: $("format").value,
    surface: saved.surface || "hard",
  });
  scene.setSurface(state.surface);
  $("surface-label").textContent =
    state.surface[0].toUpperCase() + state.surface.slice(1) + " court";
  $("welcome").hidden = true;
  $("court-caption").hidden = true;
  $("hud").hidden = false;
  $("pause").hidden = false;
  $("match-type").textContent =
    state.mode === "practice" ? "PRACTICE SESSION" : "CLUB EXHIBITION";
  $("court").focus();
};
function hud() {
  const s = state.score;
  for (let i = 0; i < 2; i++) {
    for (const k of ["sets", "games"]) $(k + i).textContent = s[k][i];
    $("points" + i).textContent = pointLabel(s, i);
    $("server" + i).style.opacity = s.server === i ? "1" : "0";
  }
  $("rally").textContent =
    state.rally > 1
      ? `${state.rally} SHOT RALLY`
      : state.faults
        ? "SECOND SERVE"
        : "FIRST SERVE";
  $("clock").textContent = `${Math.floor(state.time / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(state.time % 60)
    .toString()
    .padStart(2, "0")}`;
  $("serve-hint").hidden = state.phase !== "serve" || s.server !== 0;
  const feedback =
    state.phase === "point" ||
    state.phase === "complete" ||
    (state.phase === "serve" && state.faults > 0);
  $("feedback").hidden = !feedback;
  $("feedback").textContent = state.message;
  $("footer-state").textContent =
    state.phase === "complete"
      ? state.message
      : `${input.shot[0].toUpperCase() + input.shot.slice(1)} selected · ${state.difficulty} opponent`;
  if (state.phase === "complete" && !recorded) {
    recorded = true;
    stats.matches++;
    stats.wins += s.winner === 0 ? 1 : 0;
    stats.best = Math.max(stats.best, state.bestRally);
    try {
      localStorage.setItem("baseline-stats", JSON.stringify(stats));
    } catch {}
    showDialog(
      `<h2>${s.winner === 0 ? "Your court. Your match." : "Every match makes you better."}</h2><p>${s.history.map((g) => g.join(" – ")).join(" / ")} · Longest rally: ${state.bestRally} shots</p><button class="primary" id="again">Play again</button><button class="secondary" id="home">Return to clubhouse</button>`,
      "MATCH COMPLETE",
    );
    $("again").onclick = () => {
      closeDialog();
      $("start").click();
    };
    $("home").onclick = () => {
      closeDialog();
      active = false;
      $("welcome").hidden = false;
      $("court-caption").hidden = false;
      $("hud").hidden = true;
      $("pause").hidden = true;
      $("feedback").hidden = true;
    };
  }
}
const previous = {
  ball: { ...state.ball },
  players: state.players.map((p) => ({ ...p })),
};
let onlineClient = null;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  acc += paused ? 0 : dt;
  while (acc >= STEP) {
    Object.assign(previous.ball, state.ball);
    state.players.forEach((p, i) => Object.assign(previous.players[i], p));
    if (active && onlineClient)
      onlineClient.advance(
        paused
          ? { x: 0, z: 0, aim: 0, swing: false, sprint: false, shot: "flat" }
          : input.read(
              state.players[0].side,
              rig.horizontalSign(scene.camera, state.players[0]),
            ),
        STEP,
      );
    else if (active)
      stepMatch(
        state,
        input.read(
          state.players[0].side,
          rig.horizontalSign(scene.camera, state.players[0]),
        ),
      );
    else {
      state.time += STEP;
      state.events = [];
    }
    for (const e of state.events) audio.play(e.type);
    acc -= STEP;
  }
  if (onlineClient) state = onlineClient.sample();
  const alpha = acc / STEP,
    visual = {
      ...state,
      ball: { ...state.ball },
      players: state.players.map((p) => ({ ...p })),
    };
  if (!paused && !onlineClient) {
    for (const key of ["x", "y", "z"])
      visual.ball[key] =
        previous.ball[key] + (state.ball[key] - previous.ball[key]) * alpha;
    visual.players.forEach((p, i) => {
      for (const key of ["x", "z"])
        p[key] =
          previous.players[i][key] +
          (p[key] - previous.players[i][key]) * alpha;
    });
  }
  rig.update(scene.camera, state, dt, !active);
  scene.render(visual);
  if (active) hud();
  requestAnimationFrame(frame);
}
window.addEventListener("resize", scene.resize);
document.addEventListener("visibilitychange", () => {
  if (document.hidden && active && !paused) pause();
});
window.addEventListener("pagehide", () => {
  scene.dispose();
  input.dispose();
});
scene.setSurface(saved.surface || "hard");
$("surface-label").textContent =
  `${saved.surface[0].toUpperCase()}${saved.surface.slice(1)} court`;
requestAnimationFrame(frame);
const clubhouse = createClubhouse(showDialog, (room, user, socket) => {
  onlineClient?.dispose();
  onlineClient = new OnlineMatch(room, user, socket);
  state = onlineClient.sample();
  active = true;
  paused = false;
  recorded = true;
  input.clear();
  closeDialog();
  $("welcome").hidden = true;
  $("court-caption").hidden = true;
  $("hud").hidden = false;
  $("pause").hidden = false;
  $("match-type").textContent = room.ranked ? "RANKED MATCH" : "ONLINE CASUAL";
  scene.setSurface(state.surface);
  audio.activate();
});
window.addEventListener("baseline:preferences", (event) => {
  Object.assign(saved, event.detail);
  audio.enabled = saved.sound !== false;
  scene.setQuality(saved.quality === "low");
  if (!active) {
    scene.setSurface(saved.surface);
    $("surface-label").textContent =
      saved.surface[0].toUpperCase() + saved.surface.slice(1) + " court";
  }
  save();
});
const clubButton = document.createElement("button");
clubButton.textContent = "Clubhouse";
clubButton.onclick = clubhouse.open;
document.querySelector("header nav").append(clubButton);
