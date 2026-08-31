import path from "node:path";
import { fileURLToPath } from "node:url";
import db from "./db.js";
import { migrate as logger } from "./logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const migrateUp = async () => {
	const version = await db().migrate.currentVersion();
	logger.info("Current database version:", version);
	return await db().migrate.latest({
		tableName: "migrations",
		directory: path.join(__dirname, "migrations"),
	});
};

export { migrateUp };
