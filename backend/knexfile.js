import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default {
	development: {
		client: "mysql2",
		migrations: {
			tableName: "migrations",
			stub: "lib/migrate_template.js",
			directory: join(__dirname, "migrations"),
		},
	},

	production: {
		client: "mysql2",
		migrations: {
			tableName: "migrations",
			stub: "lib/migrate_template.js",
			directory: join(__dirname, "migrations"),
		},
	},
};
