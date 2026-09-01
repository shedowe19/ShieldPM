import path from "node:path";
import { fileURLToPath } from "node:url";
import knex from "knex";
import { configGet, configHas } from "./lib/config.js";
import { global as logger } from "./logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let instance = null;
let permanentlyClosed = false;

const generateDbConfig = () => {
	if (!configHas("database")) {
		throw new Error(
			"Database config does not exist! Please read the instructions: https://github.com/shedowe19/ShieldPM",
		);
	}

	const cfg = configGet("database");

	if (cfg.engine === "knex-native") {
		return cfg.knex;
	}

	return {
		client: cfg.engine,
		connection: {
			host: cfg.host,
			user: cfg.user,
			password: cfg.password,
			database: cfg.name,
			port: cfg.port,
			...(cfg.ssl ? { ssl: cfg.ssl } : {}),
		},
		migrations: {
			tableName: "migrations",
			directory: path.join(__dirname, "migrations"),
		},
		pool: {
			min: 2,
			max: 10,
			propagateCreateError: false,
			afterCreate: (connection, callback) => {
				connection.on("error", (err) => {
					logger.error("DB: Connection Error", err);
				});
				callback(null, connection);
			},
		},
	};
};

const getInstance = () => {
	if (permanentlyClosed) {
		throw new Error("Database pool is closed during process shutdown");
	}
	if (!instance) {
		instance = knex(generateDbConfig());
	}
	return instance;
};

const destroyDatabase = async () => {
	permanentlyClosed = true;
	if (!instance) return;
	const current = instance;
	instance = null;
	await current.destroy();
};

export default getInstance;
export { destroyDatabase };
