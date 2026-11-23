import { api, escapeHtml as esc } from "./api.js";
export function createClubhouse(openDialog) {
  let user = null,
    page = "overview",
    authMode = "login",
    chatId = null,
    adminPage = 0,
    adminSearch = "";
  const root = () => document.getElementById("dialog-content");
  const tabs = () =>
    `<nav class="club-tabs" aria-label="Clubhouse"><button data-page="overview">Overview</button><button data-page="profile">Profile</button><button data-page="social">Friends & messages</button><button data-page="leaderboard">Rankings</button><button data-page="history">History</button>${user?.role === "ADMIN" ? '<button data-page="admin">Administration</button>' : ""}<button data-action="logout">Sign out</button></nav>`;
  const formField = (name, label, value = "", type = "text") =>
    `<label class="club-field">${label}<input name="${name}" type="${type}" value="${esc(value)}" ${type === "password" ? 'minlength="12" maxlength="128" autocomplete="current-password"' : 'maxlength="50"'} required></label>`;
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
        `<h2>Club administration.</h2><p>${h.counts.users} accounts · ${h.counts.matches} matches · uptime ${h.uptime}s</p><form id="club-admin-search">${formField("q", "Search usernames", adminSearch)}<button class="secondary">Search</button></form>${d.users.map((u) => `<div class="club-person"><span>${esc(u.username)} · ${u.role} · ${u.disabled ? "Suspended" : "Active"} · ${u.rating}</span>${u.id !== user.id ? `<button class="secondary" data-suspend="${u.id}" data-disabled="${!u.disabled}">${u.disabled ? "Reactivate" : "Suspend"}</button><button class="secondary" data-role="${u.id}" data-value="${u.role === "PLAYER" ? "ADMIN" : "PLAYER"}">Make ${u.role === "PLAYER" ? "admin" : "player"}</button>` : ""}</div>`).join("")}<p>Page ${adminPage + 1} · ${d.total} accounts</p><button class="secondary" data-admin-page="${Math.max(0, adminPage - 1)}">Previous page</button><button class="secondary" data-admin-page="${adminPage + 1}">Next page</button><h3>Database management</h3><button class="secondary" id="club-backup">Download database backup</button><form id="club-restore"><label class="club-field">Backup file<input name="backup" type="file" accept="application/json" required></label>${formField("confirm", "Type RESTORE to replace data and sign everyone out")}<button class="secondary">Restore database</button></form><h3>Audit log</h3>${table(
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
        `<h2>Your player profile.</h2>${user.avatar ? `<img class="club-avatar" alt="Your avatar" src="${esc(user.avatar)}?v=${Date.now()}">` : ""}<form id="club-profile">${formField("displayName", "Display name", user.displayName)}<label class="club-field">Bio<textarea name="bio" maxlength="500">${esc(user.bio)}</textarea></label><button class="primary">Save profile</button></form><form id="club-avatar"><label class="club-field">Avatar (PNG, JPEG or WebP; up to 3 MB)<input type="file" name="avatar" accept="image/png,image/jpeg,image/webp" required></label><button class="secondary">Upload avatar</button></form><form id="club-password"><h3>Change password</h3>${formField("currentPassword", "Current password", "", "password")}${formField("newPassword", "New password", "", "password")}<button class="secondary">Update password and sign out</button></form>`,
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
    submit("club-auth", async (f) => {
      const d = await api("/auth/" + authMode, {
        method: "POST",
        body: Object.fromEntries(f),
      });
      user = d.user;
      page = "overview";
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
      user = (await api("/auth/me")).user;
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
