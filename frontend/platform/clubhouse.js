import { api, escapeHtml as esc } from "./api.js";
export function createClubhouse(openDialog) {
  let user = null,
    page = "overview",
    authMode = "login";
  const root = () => document.getElementById("dialog-content");
  const tabs = () =>
    `<nav class="club-tabs" aria-label="Clubhouse"><button data-page="overview">Overview</button><button data-page="profile">Profile</button><button data-page="leaderboard">Rankings</button><button data-page="history">History</button><button data-action="logout">Sign out</button></nav>`;
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
