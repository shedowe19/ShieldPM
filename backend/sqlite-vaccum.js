#!/usr/bin/env node

import Database from "better-sqlite3";
import { activeSqliteFilename } from "./lib/sqlite-maintenance.js";

const filename = activeSqliteFilename();
const db = new Database(filename, {
	fileMustExist: true,
});

try {
	console.log(`Running explicit SQLite VACUUM for ${filename}...`);
	db.pragma("journal_mode = WAL");
	db.pragma("auto_vacuum = 1");
	db.exec("VACUUM;");
} finally {
	db.close();
}
