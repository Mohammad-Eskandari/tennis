import { api, escapeHtml as esc } from "./api.js";
import { io } from "socket.io-client";
import { sitesTransport } from "./sites-transport.js";
export function createClubhouse(openDialog, onOnline = () => {}) {
  let socket = null,
    room = null,
    playingRoom = null,
    platformConfig = { transport: "socket.io" };
  function connect() {
    if (socket?.auth.csrf === user.csrf) {
      if (!socket.connected) socket.connect();
      return;
    }
    if (socket) {
      socket.disconnect();
    }
    socket =
      platformConfig.transport === "sites-poll"
        ? sitesTransport({ csrf: user.csrf })
        : io({ auth: { csrf: user.csrf }, withCredentials: true });
    socket.on("match:state", (r) => {
      if (!room || r.id !== room.id) return;
      room = r;
      if (r.status === "ACTIVE" && playingRoom !== r.id) {
        playingRoom = r.id;
        onOnline(r, user, socket);
      } else if (page === "online" && document.getElementById("dialog").open)
        guarded(render);
    });
  }
  function watch(r) {
    room = r;
    socket?.emit("match:watch", r.id, (result) => {
      if (result.room) {
        room = result.room;
        if (room.status === "ACTIVE" && playingRoom !== room.id) {
          playingRoom = room.id;
          onOnline(room, user, socket);
        }
      }
    });
  }
  let user = null,
    page = "overview",
    authMode = "login",
    chatId = null,
    adminPage = 0,
    adminSearch = "";
  const root = () => document.getElementById("dialog-content");
  // Refresh only conversation contents, preserving the user's draft and focus.
  setInterval(() => {
    if (
      page === "social" &&
      chatId &&
      user &&
      document.getElementById("dialog").open &&
      document.querySelector(".club-messages")
    )
      api("/messages/" + chatId)
        .then((d) => {
          const box = document.querySelector(".club-messages");
          if (box)
            box.innerHTML = d.messages
              .map(
                (m) =>
                  `<p><strong>${m.sender === user.id ? "You" : "Friend"}</strong> ${esc(m.body)}</p>`,
              )
              .join("");
        })
        .catch(() => {});
  }, 1500);
  const tabs = () =>
    `<nav class="club-tabs" aria-label="Clubhouse"><button data-page="overview">Overview</button><button data-page="online">Play online</button><button data-page="profile">Profile</button><button data-page="social">Friends & messages</button><button data-page="leaderboard">Rankings</button><button data-page="history">History</button>${user?.role === "ADMIN" ? '<button data-page="admin">Administration</button>' : ""}<button data-action="logout">Sign out</button></nav>`;
  const formField = (name, label, value = "", type = "text") =>
    `<label class="club-field">${label}<input name="${name}" type="${type}" value="${esc(value)}" ${type === "password" ? 'minlength="12" maxlength="128" autocomplete="current-password"' : 'maxlength="50"'} required></label>`;
  function preferencesForm() {
    const s = user.settings || {};
    return `<form id="club-preferences"><h3>Account preferences</h3><label class="club-field">Sound<select name="sound"><option value="on" ${s.sound !== false ? "selected" : ""}>On</option><option value="off" ${s.sound === false ? "selected" : ""}>Off</option></select></label><label class="club-field">Graphics<select name="quality"><option value="high" ${s.quality !== "low" ? "selected" : ""}>High</option><option value="low" ${s.quality === "low" ? "selected" : ""}>Low</option></select></label><label class="club-field">Court<select name="surface">${["hard", "clay", "grass"].map((v) => `<option value="${v}" ${s.surface === v ? "selected" : ""}>${v}</option>`).join("")}</select></label><button class="secondary">Save account preferences</button></form>`;
  }
  function shell(html) {
    root().innerHTML = `${user ? tabs() : ""}<div id="club-error" class="club-error" role="alert" hidden></div>${html}`;
    bind();
  }
  function error(e) {
    const el = document.getElementById("club-error");
    if (el) {
      el.hidden = false;
      el.textContent = e.message;
    } else
      root().innerHTML = `<p role="alert">${esc(e.message)}</p><button class="secondary" id="club-retry">Retry</button>`;
    document
      .getElementById("club-retry")
      ?.addEventListener("click", () => open());
  }
  async function render() {
    if (!user) {
      shell(
        `<h2>${authMode === "login" ? "Welcome back." : "Join the club."}</h2><p>Keep your profile and court history with you.</p><form id="club-auth">${formField("username", "Username")}${formField("password", "Password (12–128 characters)", "", "password")}<button class="primary" type="submit">${authMode === "login" ? "Sign in" : "Create account"}</button></form><button class="secondary" data-action="auth-toggle">${authMode === "login" ? "New here? Create an account" : "Already a member? Sign in"}</button>`,
      );
      return;
    }
    if (page === "online") {
      const [d, inv, friends] = await Promise.all([
        api("/rooms"),
        api("/invitations"),
        api("/friends"),
      ]);
      if (
        d.current.length &&
        (!room || room.status === "COMPLETED" || room.status === "ABANDONED")
      )
        watch(d.current[0]);
      shell(
        `<h2>Meet at the net.</h2>${
          room && ["WAITING", "ACTIVE"].includes(room.status)
            ? `<p>Room <strong>${esc(room.code)}</strong> · ${room.ranked ? "Ranked" : "Casual"} · ${room.names.map((n) => esc(n || "Waiting for player")).join(" vs ")}</p><p>${room.ready.map((ready, i) => `${esc(room.names[i] || "Guest")}: ${ready ? "Ready" : "Not ready"}`).join(" · ")}</p><button class="primary" id="club-ready">Ready to play</button><button class="secondary" id="club-room-leave">Leave room</button><form id="club-invite"><label class="club-field">Invite a friend<select name="userId">${friends.friends
                .filter((f) => f.status === "ACCEPTED")
                .map(
                  (f) =>
                    `<option value="${f.other_id}">${esc(f.display_name)}</option>`,
                )
                .join(
                  "",
                )}</select></label><button class="secondary">Send invitation</button></form>`
            : `<button class="primary" id="club-create-room">Create casual room</button><button class="secondary" id="club-ranked">Find ranked opponent</button><p>Ranked matchmaking pairs players within 300 rating points. Elo K=24; both players must ready.</p><form id="club-join-room">${formField("code", "Room code")}<button class="secondary">Join private room</button></form><h3>Open casual rooms</h3>${
                d.rooms
                  .filter((r) => !r.full)
                  .map(
                    (r) =>
                      `<div class="club-person"><span>${esc(r.host)} · ${esc(r.code)}</span><button class="secondary" data-join="${r.code}">Join</button></div>`,
                  )
                  .join("") ||
                "<p>No open rooms. Create one to invite a friend.</p>"
              }`
        }<h3>Invitations</h3>${inv.invitations.map((i) => `<div class="club-person"><span>${esc(i.username)} invited you</span><button class="secondary" data-invitation="${i.id}" data-choice="accept">Accept</button><button class="secondary" data-invitation="${i.id}" data-choice="decline">Decline</button></div>`).join("") || "<p>No pending invitations.</p>"}<button class="secondary" data-page="online">Refresh rooms</button>`,
      );
    }
    if (page === "social") {
      const d = await api("/friends");
      const chat = chatId ? await api("/messages/" + chatId) : null;
      shell(
        `<h2>Your tennis circle.</h2><form id="club-search">${formField("q", "Find a player by username")}<button class="secondary">Search players</button></form><div id="club-players"></div><h3>Friends & requests</h3>${d.friends.length ? d.friends.map((f) => `<div class="club-person"><span>${esc(f.display_name)} · ${f.status === "ACCEPTED" ? (f.online ? "Online" : "Offline") : "Pending request"}</span>${f.status === "ACCEPTED" ? `<button class="secondary" data-chat="${f.other_id}">Messages</button>` : f.recipient === user.id ? `<button class="secondary" data-friend="${f.id}" data-action="accept">Accept</button><button class="secondary" data-friend="${f.id}" data-action="reject">Reject</button>` : "<span>Sent</span>"}<button class="secondary" data-remove="${f.id}">Remove</button></div>`).join("") : "<p>No friends yet. Find a player to send a request.</p>"}${chat ? `<h3>Conversation</h3><div class="club-messages">${chat.messages.map((m) => `<p><strong>${m.sender === user.id ? "You" : "Friend"}</strong> ${esc(m.body)}</p>`).join("") || "<p>Say hello.</p>"}</div><form id="club-message">${formField("body", "Message")}<button class="primary">Send message</button></form>` : ""}<button class="secondary" data-page="social">Refresh messages & presence</button>`,
      );
    }
    if (page === "admin") {
      const [d, h, audit] = await Promise.all([
        api(
          `/admin/users?q=${encodeURIComponent(adminSearch)}&page=${adminPage}`,
        ),
        api("/admin/health"),
        api("/admin/audit"),
      ]);
      shell(
        `<h2>Club administration.</h2><p>${h.counts.users} accounts · ${h.counts.matches} matches · ${h.uptime === null ? esc(h.hosting) : `uptime ${h.uptime}s`}</p><form id="club-admin-search">${formField("q", "Search usernames", adminSearch)}<button class="secondary">Search</button></form>${d.users.map((u) => `<div class="club-person"><span>${esc(u.username)} · ${u.role} · ${u.disabled ? "Suspended" : "Active"} · ${u.rating}</span>${u.id !== user.id ? `<button class="secondary" data-suspend="${u.id}" data-disabled="${!u.disabled}">${u.disabled ? "Reactivate" : "Suspend"}</button><button class="secondary" data-role="${u.id}" data-value="${u.role === "PLAYER" ? "ADMIN" : "PLAYER"}">Make ${u.role === "PLAYER" ? "admin" : "player"}</button>` : ""}</div>`).join("")}<p>Page ${adminPage + 1} · ${d.total} accounts</p><button class="secondary" data-admin-page="${Math.max(0, adminPage - 1)}">Previous page</button><button class="secondary" data-admin-page="${adminPage + 1}">Next page</button>${platformConfig.transport === "sites-poll" ? `<h3>Database management</h3><button class="secondary" id="club-native-backup">Create and download encrypted backup</button><form id="club-native-import"><label class="club-field">Sites backup (.tennis.enc)<input name="backup" type="file" accept=".enc" required></label><button class="secondary">Validate backup</button></form><div id="club-native-preview"></div>` : `<h3>Database management</h3><button class="secondary" id="club-backup">Download database backup</button><form id="club-restore"><label class="club-field">Backup file<input name="backup" type="file" accept="application/json" required></label>${formField("confirm", "Type RESTORE to replace data and sign everyone out")}<button class="secondary">Restore database</button></form>`}<h3>Audit log</h3>${table(
          audit.events.map((e) => [
            e.action,
            new Date(e.created_at).toLocaleString(),
          ]),
          ["Action", "Time"],
        )}`,
      );
    }
    if (page === "overview") {
      shell(
        `<h2>Welcome, ${esc(user.displayName)}.</h2><p>Your next match is waiting. Close the clubhouse to practice or play the computer.</p><div class="stats"><div><strong>${user.rating}</strong><span>Rating</span></div><div><strong>${user.wins}</strong><span>Wins</span></div><div><strong>${user.losses}</strong><span>Losses</span></div></div>`,
      );
    }
    if (page === "profile") {
      shell(
        `<h2>Your player profile.</h2>${user.avatar ? `<img class="club-avatar" alt="Your avatar" src="${esc(user.avatar)}?v=${Date.now()}">` : ""}<form id="club-profile">${formField("displayName", "Display name", user.displayName)}<label class="club-field">Bio<textarea name="bio" maxlength="500">${esc(user.bio)}</textarea></label><button class="primary">Save profile</button></form><form id="club-avatar"><label class="club-field">Avatar (PNG, JPEG or WebP; up to 3 MB)<input type="file" name="avatar" accept="image/png,image/jpeg,image/webp" required></label><button class="secondary">Upload avatar</button></form>${preferencesForm()}<form id="club-password"><h3>Change password</h3>${formField("currentPassword", "Current password", "", "password")}${formField("newPassword", "New password", "", "password")}<button class="secondary">Update password and sign out</button></form>`,
      );
    }
    if (page === "leaderboard") {
      const d = await api("/leaderboard");
      shell(
        `<h2>Club rankings.</h2>${table(
          d.players.map((p, i) => [
            i + 1,
            p.displayName,
            p.rating,
            `${p.wins} / ${p.losses}`,
          ]),
          ["Rank", "Player", "Rating", "W / L"],
        )}`,
      );
    }
    if (page === "history") {
      const d = await api("/history");
      shell(
        `<h2>Your match history.</h2>${
          d.matches.length
            ? table(
                d.matches.map((m) => [
                  `${m.player1} vs ${m.player2 || "—"}`,
                  m.ranked ? "Ranked" : "Casual",
                  m.reason || m.status,
                  new Date(m.finished_at).toLocaleDateString(),
                ]),
                ["Match", "Mode", "Result", "Date"],
              )
            : "<p>No completed online matches yet.</p>"
        }`,
      );
    }
  }
  function table(rows, headers) {
    return `<div class="club-table"><table><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((v) => `<td>${esc(v)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }
  async function guarded(fn) {
    try {
      await fn();
    } catch (e) {
      error(e);
    }
  }
  function bind() {
    document
      .getElementById("club-native-backup")
      ?.addEventListener("click", () =>
        guarded(async () => {
          const data = await api("/admin/database/backups", {
            method: "POST",
            body: {},
          });
          const res = await fetch(
            "/api/admin/database/backups/" + data.backup.id + "/download",
            { credentials: "same-origin" },
          );
          if (!res.ok) throw new Error("Backup download failed");
          const url = URL.createObjectURL(await res.blob()),
            a = document.createElement("a");
          a.href = url;
          a.download = data.backup.filename;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }),
      );
    const create = async (path, body = {}) => {
      const d = await api(path, { method: "POST", body });
      watch(d.room);
      await render();
    };
    document
      .getElementById("club-create-room")
      ?.addEventListener("click", () => guarded(() => create("/rooms")));
    document
      .getElementById("club-ranked")
      ?.addEventListener("click", () => guarded(() => create("/matchmaking")));
    document.getElementById("club-ready")?.addEventListener("click", () =>
      guarded(async () => {
        const d = await api("/rooms/" + room.id + "/ready", {
          method: "POST",
          body: {},
        });
        watch(d.room);
        if (d.room.status === "WAITING") await render();
      }),
    );
    document.getElementById("club-room-leave")?.addEventListener("click", () =>
      guarded(async () => {
        await api("/rooms/" + room.id + "/leave", { method: "POST", body: {} });
        room = null;
        await render();
      }),
    );
    root()
      .querySelectorAll("[data-join]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            guarded(() => create("/rooms/join", { code: b.dataset.join }))),
      );
    root()
      .querySelectorAll("[data-invitation]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            guarded(async () => {
              const d = await api("/invitations/" + b.dataset.invitation, {
                method: "POST",
                body: { action: b.dataset.choice },
              });
              if (d.room) watch(d.room);
              await render();
            })),
      );
    root()
      .querySelectorAll("[data-chat]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            guarded(async () => {
              chatId = b.dataset.chat;
              await render();
            })),
      );
    root()
      .querySelectorAll("[data-friend]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            guarded(async () => {
              await api("/friends/" + b.dataset.friend, {
                method: "PATCH",
                body: { action: b.dataset.action },
              });
              await render();
            })),
      );
    root()
      .querySelectorAll("[data-remove]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            guarded(async () => {
              await api("/friends/" + b.dataset.remove, { method: "DELETE" });
              await render();
            })),
      );
    root()
      .querySelectorAll("[data-suspend]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            guarded(async () => {
              await api("/admin/users/" + b.dataset.suspend, {
                method: "PATCH",
                body: { disabled: b.dataset.disabled === "true" },
              });
              await render();
            })),
      );
    root()
      .querySelectorAll("[data-role]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            guarded(async () => {
              await api("/admin/users/" + b.dataset.role, {
                method: "PATCH",
                body: { role: b.dataset.value },
              });
              await render();
            })),
      );
    root()
      .querySelectorAll("[data-admin-page]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            guarded(async () => {
              adminPage = Number(b.dataset.adminPage);
              await render();
            })),
      );
    document.getElementById("club-backup")?.addEventListener("click", () =>
      guarded(async () => {
        const backup = await api("/admin/backup");
        const url = URL.createObjectURL(
          new Blob([JSON.stringify(backup)], { type: "application/json" }),
        );
        const a = document.createElement("a");
        a.href = url;
        a.download = "baseline-backup.json";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }),
    );
    root()
      .querySelectorAll("[data-page]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            guarded(async () => {
              page = b.dataset.page;
              await render();
            })),
      );
    root()
      .querySelector('[data-action="auth-toggle"]')
      ?.addEventListener("click", () => {
        authMode = authMode === "login" ? "register" : "login";
        render();
      });
    root()
      .querySelector('[data-action="logout"]')
      ?.addEventListener("click", () =>
        guarded(async () => {
          await api("/auth/logout", { method: "POST" });
          socket?.disconnect();
          socket = null;
          room = null;
          user = null;
          render();
        }),
      );
    const submit = (id, fn) => {
      const form = document.getElementById(id);
      if (form)
        form.onsubmit = (e) => {
          e.preventDefault();
          const button = form.querySelector("button");
          button.disabled = true;
          guarded(async () => {
            try {
              await fn(new FormData(form));
            } finally {
              button.disabled = false;
            }
          });
        };
    };
    submit("club-native-import", async (f) => {
      const data = await api("/admin/database/imports", {
        method: "POST",
        form: f,
      });
      document.getElementById("club-native-preview").innerHTML =
        `<p>Validated backup from ${esc(data.manifest.createdAt)}. ${esc(JSON.stringify(data.manifest.counts))}</p><form id="club-native-restore">${formField("password", "Administrator password", "", "password")}${formField("confirmation", "Type RESTORE BACKUP")}<button class="secondary">Confirm restore and sign everyone out</button></form>`;
      const form = document.getElementById("club-native-restore");
      form.onsubmit = (e) => {
        e.preventDefault();
        guarded(async () => {
          await api("/admin/database/restore", {
            method: "POST",
            body: {
              ticket: data.ticket,
              ...Object.fromEntries(new FormData(form)),
            },
          });
          socket?.disconnect();
          user = null;
          await render();
        });
      };
    });
    submit("club-auth", async (f) => {
      const d = await api("/auth/" + authMode, {
        method: "POST",
        body: Object.fromEntries(f),
      });
      user = d.user;
      connect();
      page = "overview";
      await render();
    });
    submit("club-preferences", async (f) => {
      const data = await api("/profile/settings", {
        method: "PATCH",
        body: {
          sound: f.get("sound") === "on",
          quality: f.get("quality"),
          surface: f.get("surface"),
        },
      });
      user.settings = data.settings;
      window.dispatchEvent(
        new CustomEvent("baseline:preferences", { detail: data.settings }),
      );
      await render();
    });
    submit("club-join-room", (f) =>
      create("/rooms/join", {
        code: String(f.get("code")).trim().toUpperCase(),
      }),
    );
    submit("club-invite", async (f) => {
      await api("/rooms/" + room.id + "/invite", {
        method: "POST",
        body: { userId: f.get("userId") },
      });
      await render();
    });
    submit("club-search", async (f) => {
      const d = await api("/players?q=" + encodeURIComponent(f.get("q")));
      document.getElementById("club-players").innerHTML =
        d.players
          .filter((p) => p.id !== user.id)
          .map(
            (p) =>
              `<div class="club-person"><span>${esc(p.displayName)} · ${p.rating}</span><button class="secondary" data-add="${p.id}">Add friend</button></div>`,
          )
          .join("") || "<p>No players found.</p>";
      root()
        .querySelectorAll("[data-add]")
        .forEach(
          (b) =>
            (b.onclick = () =>
              guarded(async () => {
                await api("/friends", {
                  method: "POST",
                  body: { userId: b.dataset.add },
                });
                await render();
              })),
        );
    });
    submit("club-message", async (f) => {
      await api("/messages/" + chatId, {
        method: "POST",
        body: { body: f.get("body") },
      });
      await render();
    });
    submit("club-admin-search", async (f) => {
      adminSearch = f.get("q");
      adminPage = 0;
      await render();
    });
    submit("club-restore", async (f) => {
      const file = f.get("backup");
      if (file.size > 20 * 1024 * 1024)
        throw new Error("Backup must be under 20 MB");
      await api("/admin/restore", {
        method: "POST",
        body: {
          confirm: f.get("confirm"),
          backup: JSON.parse(await file.text()),
        },
      });
      user = null;
      await render();
    });
    submit("club-profile", async (f) => {
      const d = await api("/profile", {
        method: "PATCH",
        body: Object.fromEntries(f),
      });
      user = { ...user, ...d.profile };
      await render();
    });
    submit("club-avatar", async (f) => {
      const d = await api("/profile/avatar", { method: "POST", form: f });
      user.avatar = d.avatar;
      await render();
    });
    submit("club-password", async (f) => {
      await api("/profile/password", {
        method: "POST",
        body: Object.fromEntries(f),
      });
      user = null;
      await render();
    });
  }
  async function open() {
    openDialog(
      '<h2>Opening the clubhouse…</h2><p role="status">Connecting to your account.</p>',
      "THE CLUBHOUSE",
    );
    await guarded(async () => {
      platformConfig = await api("/config");
      user = (await api("/auth/me")).user;
      if (user) connect();
      await render();
    });
  }
  return {
    open,
    get user() {
      return user;
    },
  };
}
