import crypto from "node:crypto";
import fs from "node:fs";
import { global as logger } from "../logger.js";

const dataPath = process.env.DATA_PATH || "/data";
const keysFile = `${dataPath}/npmplus/keys.json`;
const mysqlEngine = "mysql2";
const postgresEngine = "pg";
const sqliteClientName = "better-sqlite3";

let instance = null;

// 1. Load from config file first (not recommended anymore)
// 2. Use config env variables next
const configure = () => {
	const filename = `${dataPath}/npmplus/default.json`;
	if (fs.existsSync(filename)) {
		let configData;
		try {
			// Load this json  synchronously
			const rawData = fs.readFileSync(filename);
			configData = JSON.parse(rawData);
		} catch (_) {
			// do nothing
		}

		if (configData?.database) {
			logger.info(`Using configuration from file: ${filename}`);

			// Migrate those who have "mysql" engine to "mysql2"
			if (configData.database.engine === "mysql") {
				configData.database.engine = mysqlEngine;
			}

			instance = configData;
			instance.keys = getKeys();
			return;
		}
	}

	const toBool = (v) => /^(1|true|yes|on)$/i.test((v || "").trim());

	const envMysqlHost = process.env.DB_MYSQL_HOST || null;
	const envMysqlUser = process.env.DB_MYSQL_USER || null;
	const envMysqlName = process.env.DB_MYSQL_NAME || null;
	const envMysqlSSL = toBool(process.env.DB_MYSQL_SSL);
	const envMysqlSSLRejectUnauthorized =
		process.env.DB_MYSQL_SSL_REJECT_UNAUTHORIZED === undefined
			? true
			: toBool(process.env.DB_MYSQL_SSL_REJECT_UNAUTHORIZED);
	const envMysqlSSLVerifyIdentity =
		process.env.DB_MYSQL_SSL_VERIFY_IDENTITY === undefined
			? true
			: toBool(process.env.DB_MYSQL_SSL_VERIFY_IDENTITY);
	if (envMysqlHost && envMysqlUser && envMysqlName) {
		// we have enough mysql creds to go with mysql
		logger.info("Using MySQL configuration");
		instance = {
			database: {
				engine: mysqlEngine,
				host: envMysqlHost,
				port: process.env.DB_MYSQL_PORT || 3306,
				user: envMysqlUser,
				password: process.env.DB_MYSQL_PASSWORD,
				name: envMysqlName,
				ssl: envMysqlSSL
					? { rejectUnauthorized: envMysqlSSLRejectUnauthorized, verifyIdentity: envMysqlSSLVerifyIdentity }
					: false,
			},
			keys: getKeys(),
		};
		return;
	}

	const envPostgresHost = process.env.DB_POSTGRES_HOST || null;
	const envPostgresUser = process.env.DB_POSTGRES_USER || null;
	const envPostgresName = process.env.DB_POSTGRES_NAME || null;
	if (envPostgresHost && envPostgresUser && envPostgresName) {
		// we have enough postgres creds to go with postgres
		logger.info("Using Postgres configuration");
		instance = {
			database: {
				engine: postgresEngine,
				host: envPostgresHost,
				port: process.env.DB_POSTGRES_PORT || 5432,
				user: envPostgresUser,
				password: process.env.DB_POSTGRES_PASSWORD,
				name: envPostgresName,
			},
			keys: getKeys(),
		};
		return;
	}

	const envSqliteFile = `${dataPath}/npmplus/database.sqlite`;
	logger.info(`Using Sqlite: ${envSqliteFile}`);
	instance = {
		database: {
			engine: "knex-native",
			knex: {
				client: sqliteClientName,
				connection: {
					filename: envSqliteFile,
				},
				useNullAsDefault: true,
			},
		},
		keys: getKeys(),
	};
};

const getKeys = () => {
	// Get keys from file
	logger.info("Checking for keys file:", keysFile);
	if (!fs.existsSync(keysFile)) {
		generateKeys();
	} else {
		logger.info("Keys file exists OK");
	}

	try {
		// Load this json keysFile synchronously and return the json object
		const rawData = fs.readFileSync(keysFile);
		const keys = JSON.parse(rawData);

		// Migration: Add encryptionKey if missing
		if (!keys.encryptionKey) {
			logger.info("Migrating keys file: Adding encryptionKey...");
			keys.encryptionKey = crypto.randomBytes(32).toString("hex");
			fs.writeFileSync(keysFile, JSON.stringify(keys, null, 2));
		}

		return keys;
	} catch (err) {
		logger.error(`Could not read JWT key pair from config file: ${keysFile}`, err);
		process.exit(1);
	}
};

const generateKeys = () => {
	logger.info("Creating a new JWT key pair...");
	// Now create the keys and save them in the config.
	const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
		modulusLength: 2048,
		publicKeyEncoding: {
			type: "spki",
			format: "pem",
		},
		privateKeyEncoding: {
			type: "pkcs8",
			format: "pem",
		},
	});

	const keys = {
		key: privateKey,
		pub: publicKey,
		encryptionKey: crypto.randomBytes(32).toString("hex"),
	};

	// Write keys config
	try {
		fs.writeFileSync(keysFile, JSON.stringify(keys, null, 2));
	} catch (err) {
		logger.error(`Could not write JWT key pair to config file: ${keysFile}: ${err.message}`);
		process.exit(1);
	}
	logger.info(`Wrote JWT key pair to config file: ${keysFile}`);
};

// ... existing code ...

/**
 * Returns the encryption key
 *
 * @returns {string}
 */
const getEncryptionKey = () => {
	instance === null && configure();
	return instance.keys.encryptionKey;
};

export { isDestructiveTestMode, configHas, configGet, isSqlite, isMysql, isPostgres, getPrivateKey, getPublicKey, getEncryptionKey };
