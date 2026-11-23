import { createApplication } from "../backend/src/server.js";
const app = await createApplication({ devFrontend: true });
const address = await app.listen();
console.log(
  `Baseline Tennis: http://${app.config.host}:${address.port} (frontend, API and multiplayer)`,
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, async () => {
    await app.close();
    process.exit(0);
  });
