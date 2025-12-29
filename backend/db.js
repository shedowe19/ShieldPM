import knex from "knex";
import { configGet, configHas } from "./lib/config.js";
import { global as logger } from "./logger.js";

let instance = null;

const generateDbConfig = () => {
	if (!configHas("database")) {
		throw new Error(
			"Database config does not exist! Please read the instructions: https://github.com/ZoeyVid/NPMplus",
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
	if (!instance) {
		instance = knex(generateDbConfig());
	}
	return instance;
};

export default getInstance;
