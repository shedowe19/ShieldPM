import { useSyncExternalStore } from "react";
import type { DatabaseEngine, DatabaseOperation, DatabaseRequest } from "src/api/backend/database";

const storageKey = "shieldpm.database.operation";
export interface DatabaseJob {
	id: string;
	token?: string;
	kind: "setup" | "switch";
	targetEngine: DatabaseEngine;
	result?: DatabaseOperation;
	recovered?: boolean;
}
const listeners = new Set<() => void>();
function restore(): DatabaseJob | null {
	try {
		const row = JSON.parse(sessionStorage.getItem(storageKey) || "null");
		if (
			row &&
			typeof row.id === "string" &&
			/^[\w-]{1,100}$/.test(row.id) &&
			typeof row.token === "string" &&
			row.token.length >= 16 &&
			row.token.length <= 512 &&
			!/[\r\n]/.test(row.token) &&
			["setup", "switch"].includes(row.kind) &&
			["sqlite", "mysql2", "pg"].includes(row.targetEngine)
		)
			return { id: row.id, token: row.token, kind: row.kind, targetEngine: row.targetEngine };
	} catch {
		/* Storage can be unavailable. Keep capabilities in memory in that case. */
	}
	return null;
}
let current = restore();
const notify = () => {
	for (const update of listeners) update();
};
export function startDatabaseOperation(
	request: DatabaseRequest,
	kind: DatabaseJob["kind"],
	targetEngine: DatabaseEngine,
) {
	current = { id: request.id, token: request.operationToken, kind, targetEngine };
	try {
		sessionStorage.setItem(storageKey, JSON.stringify(current));
	} catch {
		/* Memory-only fallback. */
	}
	notify();
}
export function recordDatabaseOperation(result: DatabaseOperation) {
	if (!current || current.id !== result.id) return;
	const terminal = result.state === "completed";
	current = { ...current, result, ...(terminal ? { token: undefined } : {}) };
	if (terminal) {
		try {
			sessionStorage.removeItem(storageKey);
		} catch {
			/* Memory state is already cleared. */
		}
	}
	notify();
}
export function acknowledgeDatabaseRecovery() {
	if (!current) return;
	current = { ...current, token: undefined, recovered: true };
	try {
		sessionStorage.removeItem(storageKey);
	} catch {
		/* Memory state is already cleared. */
	}
	notify();
}

export function clearDatabaseOperation() {
	current = null;
	try {
		sessionStorage.removeItem(storageKey);
	} catch {
		/* Memory state is already cleared. */
	}
	notify();
}
const subscribe = (update: () => void) => {
	listeners.add(update);
	return () => {
		listeners.delete(update);
	};
};
export const databaseOperationSnapshot = () => current;
export const useDatabaseOperation = () => useSyncExternalStore(subscribe, databaseOperationSnapshot, () => null);
