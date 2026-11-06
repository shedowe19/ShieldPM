import { engineOf, inspectDatabaseSelection } from "./database-config.js";

/** Resolve the active selection without initializing application models or keys. */
export function activeSqliteFilename() {
	const { database } = inspectDatabaseSelection();
	if (!database || engineOf(database) !== "sqlite")
		throw new Error("This command requires the active SQLite database; a server database is selected.");
	const filename = database.knex?.connection?.filename;
	if (typeof filename !== "string" || !filename || filename === ":memory:")
		throw new Error("The active SQLite database does not have a persistent filename.");
	return filename;
}
