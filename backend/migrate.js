import { fileURLToPath } from "node:url";
import path from "path";
import db from "./db.js";
import { migrate as logger } from "./logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const runMigrations = async (database, directory = path.join(__dirname, "migrations")) => {
	const version = await database.migrate.currentVersion();
	logger.info("Current database version:", version);
	return await database.migrate.latest({
		tableName: "migrations",
		directory,
	});
};

const migrateUp = async () => runMigrations(db());

export { migrateUp, runMigrations };
