import { isDemoMode } from "../lib/config.js";
import { databaseStatus, requestDatabaseOperation, testDatabase } from "../lib/database-switch.js";
import errs from "../lib/error.js";

const internalDatabase = {
	/** @param {any} access @returns {Promise<object>} */
	async get(access) {
		await access.can("settings:update");
		return databaseStatus();
	},
	/** @param {any} access @param {any} input @returns {Promise<object>} */
	async test(access, input) {
		await access.can("settings:update");
		if (isDemoMode()) throw new errs.PermissionError("Database changes are disabled in demo mode");
		try {
			return await testDatabase(input);
		} catch {
			throw new errs.ValidationError(
				"Cannot use the target database. Check connectivity, credentials, TLS and that it is empty.",
			);
		}
	},
	/** @param {any} access @param {any} input @returns {Promise<object>} */
	async switch(access, input) {
		await access.can("settings:update");
		if (isDemoMode()) throw new errs.PermissionError("Database changes are disabled in demo mode");
		if (input.confirm !== true || input.confirmExclusive !== true)
			throw new errs.ValidationError("Confirm the migration and exclusive ownership of both databases");
		try {
			return requestDatabaseOperation(input.target);
		} catch {
			throw new errs.ValidationError(
				"Cannot start database migration. Choose a supported engine and ensure no other operation is active.",
			);
		}
	},
};
export default internalDatabase;
