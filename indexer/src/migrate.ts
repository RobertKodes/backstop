import { loadConfig } from "./config.js";
import { makeDb, migrate } from "./db.js";

const db = makeDb(loadConfig().DATABASE_URL);
migrate(db)
  .then((applied) => {
    console.warn(applied.length ? `applied: ${applied.join(", ")}` : "up to date");
    return db.end();
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
