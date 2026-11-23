import { api } from "./api.js";
// Sites uses request-driven persistence, as in the reference pool deployment.
export function sitesTransport({ csrf }) {
  let active = true,
    connected = false,
    watched = null,
    pending = null,
    busy = false,
    timer,
    lastInput = 0;
  const handlers = new Map();
  const dispatch = (name, data) => {
    for (const fn of handlers.get(name) || []) fn(data);
  };
  const transport = {
    auth: { csrf },
    get connected() {
      return connected;
    },
    on(name, fn) {
      if (!handlers.has(name)) handlers.set(name, new Set());
      handlers.get(name).add(fn);
      return transport;
    },
    off(name, fn) {
      handlers.get(name)?.delete(fn);
      return transport;
    },
    connect() {
      active = true;
      poll();
      return transport;
    },
    disconnect() {
      active = false;
      connected = false;
      clearTimeout(timer);
      return transport;
    },
    emit(name, data, ack = () => {}) {
      if (name === "match:watch") {
        watched = data;
        api("/events/emit", { method: "POST", body: { type: name, data } })
          .then((r) => {
            if (r.room) dispatch("match:state", r.room);
            ack(r);
          })
          .catch((e) => ack({ error: e.message }));
      } else if (name === "match:input") {
        pending = { type: name, data };
      }
    },
  };
  async function poll() {
    if (!active) return;
    try {
      let r;
      if (pending && !busy && Date.now() - lastInput >= 50) {
        const body = pending;
        pending = null;
        busy = true;
        lastInput = Date.now();
        try {
          r = await api("/events/emit", { method: "POST", body });
        } finally {
          busy = false;
        }
      } else if (watched)
        r = await api("/events/emit", {
          method: "POST",
          body: { type: "match:watch", data: watched },
        });
      else r = await api("/events");
      if (!connected) {
        connected = true;
        dispatch("connect");
      }
      if (r.room) dispatch("match:state", r.room);
      for (const room of r.rooms || []) dispatch("match:state", room);
    } catch (e) {
      if (connected) {
        connected = false;
        dispatch("disconnect");
      }
      dispatch("connect_error", e);
    } finally {
      if (active) timer = setTimeout(poll, watched ? 50 : 1000);
    }
  }
  timer = setTimeout(poll, 0);
  return transport;
}
