import { configuration } from "../backend/src/config.js";
import { database } from "../backend/src/db.js";
const name = process.argv[2] || process.env.ADMIN_USERNAME;
if (!name)
  throw new Error(
    "Provide a registered username: npm run admin:grant -- username",
  );
const db = await database(configuration());
try {
  const r = await db.query(
    "UPDATE users SET role='ADMIN' WHERE lower(username)=lower($1) RETURNING id",
    [name],
  );
  if (!r.rowCount) throw new Error("Registered user not found");
  console.log("Administrator role granted");
} finally {
  await db.close();
}
