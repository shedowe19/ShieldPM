import { describe, expect, it, vi } from "vitest";

/**
 * Fix #64: revertToCommit() must call access.can() before performing any action.
 * Without the guard, any authenticated user could trigger a full config restore
 * and container restart (process.kill(1, 'SIGTERM')).
 */

// ── Mocks ────────────────────────────────────────────────────────────────────
vi.mock("../../db.js", () => ({ default: () => ({}) }));
vi.mock("../../lib/config.js", () => ({
	isDestructiveTestMode: vi.fn().mockReturnValue(false),
	configHas: vi.fn().mockReturnValue(true),
	configGet: vi.fn().mockReturnValue("mock-value"),
	isSqlite: vi.fn().mockReturnValue(true),
	isMysql: vi.fn().mockReturnValue(false),
	isPostgres: vi.fn().mockReturnValue(false),
	getPrivateKey: vi.fn().mockReturnValue("mock-private-key"),
	getPublicKey: vi.fn().mockReturnValue("mock-public-key"),
	getEncryptionKey: vi.fn().mockReturnValue("0".repeat(64)),
	isDemoMode: vi.fn().mockReturnValue(false),
}));
vi.mock("../../internal/nginx.js", () => ({ default: {} }));
vi.mock("../../internal/audit-log.js", () => ({ default: {} }));
vi.mock("isomorphic-git", () => ({
	default: { checkout: vi.fn(), log: vi.fn().mockResolvedValue([]) },
}));
vi.mock("isomorphic-git/http/node", () => ({ default: {} }));

import internalGitOps from "../../internal/gitops.js";

// ── Helpers ──────────────────────────────────────────────────────────────────
const allowedAccess = { can: vi.fn().mockResolvedValue(true) };
const deniedAccess = {
	can: vi.fn().mockRejectedValue(new Error("Forbidden")),
};

describe("Fix #64: revertToCommit requires settings:update permission", () => {
	it("calls access.can('settings:update', 'gitops-config') before doing anything", async () => {
		const access = { can: vi.fn().mockRejectedValue(new Error("Forbidden")) };
		await expect(internalGitOps.revertToCommit(access, "abc123")).rejects.toThrow("Forbidden");
		expect(access.can).toHaveBeenCalledWith("settings:update", "gitops-config");
	});

	it("access.can is the FIRST thing called — before initRepo", async () => {
		const callOrder = [];
		const access = {
			can: vi.fn().mockImplementation(() => {
				callOrder.push("access.can");
				return Promise.reject(new Error("Forbidden"));
			}),
		};
		await expect(internalGitOps.revertToCommit(access, "abc123")).rejects.toThrow("Forbidden");
		expect(callOrder[0]).toBe("access.can");
	});

	it("rejects with Forbidden for unauthorized callers", async () => {
		await expect(internalGitOps.revertToCommit(deniedAccess, "abc123")).rejects.toThrow("Forbidden");
	});
});
