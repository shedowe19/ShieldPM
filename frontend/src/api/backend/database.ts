import { get, post } from "./base";

export type DatabaseEngine = "sqlite" | "mysql2" | "pg";
export interface DatabaseTarget {
	engine: DatabaseEngine;
	host?: string;
	port?: number;
	user?: string;
	password?: string;
	name?: string;
	ssl?: boolean;
}
export interface DatabaseOperation {
	id: string;
	state: "requested" | "running" | "failed" | "completed";
	phase: string;
	error?: string;
	errorCode?: string;
	canCancel?: boolean;
	progress?: { table?: string; [key: string]: unknown };
}
export interface DatabaseRequest extends DatabaseOperation {
	operationToken: string;
}
export interface DatabaseStatus {
	engine: DatabaseEngine | null;
	configured: boolean;
	source: "file" | "environment" | "managed" | "default";
	editable: boolean;
	supportedTransitions: DatabaseEngine[];
	operation: DatabaseOperation | null;
	connection: (Omit<DatabaseTarget, "engine" | "password"> & { passwordConfigured: boolean }) | null;
}
export const getDatabase = (): Promise<DatabaseStatus> => get({ url: "/database" });
export const testDatabase = (target: DatabaseTarget): Promise<{ ok: boolean }> =>
	post({ url: "/database/test", data: target });
export const setupDatabase = (target: DatabaseTarget): Promise<DatabaseRequest> =>
	post({ url: "/database/setup", data: target });
export const switchDatabase = (target: DatabaseTarget): Promise<DatabaseRequest> =>
	post({ url: "/database/switch", rawKeys: true, data: { target, confirm: true, confirmExclusive: true } });

/** Read-only capability goes in a header, never a URL, query key, or diagnostic message. */
export async function getDatabaseOperation(
	id: string,
	token: string,
	signal?: AbortSignal,
): Promise<DatabaseOperation> {
	const response = await fetch(`/api/database/operation?id=${encodeURIComponent(id)}`, {
		credentials: "include",
		signal,
		headers: { "X-Database-Operation-Token": token },
	});
	if (!response.ok) throw new Error("database.operation-unavailable");
	const row = await response.json();
	return {
		id: row.id,
		state: row.state,
		phase: row.phase,
		canCancel: row.canCancel === true,
		...(row.error ? { error: row.error } : {}),
		...(typeof row.errorCode === "string" ? { errorCode: row.errorCode } : {}),
		...(row.progress ? { progress: row.progress } : {}),
	};
}

export async function acknowledgeDatabaseFailure(id: string, token: string): Promise<{ state: "cancelled" }> {
	// Gateway and normal runtime each publish their current CSRF token through health.
	await get({ url: "/" });
	return post({ url: "/database/operation/cancel", data: { id }, headers: { "X-Database-Operation-Token": token } });
}
