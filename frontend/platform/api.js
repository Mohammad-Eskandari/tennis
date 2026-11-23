let csrf = "";
export async function api(path, { method = "GET", body, form } = {}) {
  let res;
  try {
    res = await fetch("/api" + path, {
      method,
      credentials: "same-origin",
      headers: {
        ...(body ? { "content-type": "application/json" } : {}),
        ...(csrf ? { "x-csrf-token": csrf } : {}),
      },
      body: form || (body ? JSON.stringify(body) : undefined),
    });
  } catch {
    throw new Error(
      "Cannot reach the clubhouse server. Check your connection.",
    );
  }
  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error(
      "Clubhouse server unavailable. Start the backend to use online features.",
    );
  }
  if (!res.ok) throw new Error(data.error || "Request failed");
  if (data.user?.csrf) csrf = data.user.csrf;
  return data;
}
export const escapeHtml = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
