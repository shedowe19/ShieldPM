import path from "node:path";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const migrationConfig = {
	client: "mysql2",
	migrations: {
		tableName: "migrations",
		stub: path.join(directory, "lib/migrate_template.js"),
		directory: path.join(directory, "migrations"),
	},
};

export default { development: migrationConfig, production: migrationConfig };
