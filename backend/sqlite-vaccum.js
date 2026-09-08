#!/usr/bin/env node

import path from "node:path";
import Database from "better-sqlite3";

const db = new Database(path.join(process.env.DATA_PATH || "/data", "shieldpm/database.sqlite"), {
	fileMustExist: true,
});

try {
	db.pragma("journal_mode = WAL");
	db.pragma("auto_vacuum = 1");
	db.exec("VACUUM;");
} finally {
	db.close();
}
