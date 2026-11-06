import { afterEach, describe, expect, it, vi } from "vitest";
import {
	acknowledgeDatabaseRecovery,
	clearDatabaseOperation,
	databaseOperationSnapshot,
	recordDatabaseOperation,
	startDatabaseOperation,
} from "./DatabaseOperationStore";

const request = {
	id: "fixture-operation",
	state: "requested" as const,
	phase: "requested",
	operationToken: "synthetic-capability-never-a-password",
};
afterEach(() => {
	clearDatabaseOperation();
	sessionStorage.clear();
});
describe("tab-local database operation capability", () => {
	it("persists only the operation capability and non-secret engine identity", () => {
		startDatabaseOperation(request, "switch", "pg");
		expect(JSON.parse(sessionStorage.getItem("shieldpm.database.operation") || "null")).toEqual({
			id: request.id,
			token: request.operationToken,
			kind: "switch",
			targetEngine: "pg",
		});
		expect(databaseOperationSnapshot()?.token).toBe(request.operationToken);
	});
	it("keeps preactivation failure recovery possible, clearing the capability only after acknowledgement", () => {
		startDatabaseOperation(request, "switch", "sqlite");
		recordDatabaseOperation({ id: request.id, state: "failed", phase: "copying", canCancel: true });
		expect(databaseOperationSnapshot()?.token).toBe(request.operationToken);
		expect(sessionStorage.getItem("shieldpm.database.operation")).not.toBeNull();
		acknowledgeDatabaseRecovery();
		expect(databaseOperationSnapshot()).toMatchObject({ token: undefined, recovered: true });
		expect(sessionStorage.getItem("shieldpm.database.operation")).toBeNull();
	});
	it("drops the bearer capability on completion while retaining a public terminal result", () => {
		startDatabaseOperation(request, "setup", "sqlite");
		recordDatabaseOperation({ id: request.id, state: "completed", phase: "completed" });
		expect(databaseOperationSnapshot()?.token).toBeUndefined();
		expect(databaseOperationSnapshot()?.result?.state).toBe("completed");
		expect(sessionStorage.getItem("shieldpm.database.operation")).toBeNull();
	});
	it("resumes a tab operation after reload without storing target connection credentials", async () => {
		startDatabaseOperation(request, "switch", "mysql2");
		vi.resetModules();
		const restored = await import("./DatabaseOperationStore");
		expect(restored.databaseOperationSnapshot()).toEqual({
			id: request.id,
			token: request.operationToken,
			kind: "switch",
			targetEngine: "mysql2",
		});
		restored.clearDatabaseOperation();
	});
});
