import { configuration } from "../backend/src/config.js";
import { database } from "../backend/src/db.js";
const db = await database(configuration());
try {
  await db.migrate();
  console.log("Database migrations applied");
} finally {
  await db.close();
}
