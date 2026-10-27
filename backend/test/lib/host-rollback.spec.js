import dbErrors from "db-errors";
import { afterEach, describe, expect, it, vi } from "vitest";
import errs from "../../lib/error.js";
import { rethrowAfterHostRollback } from "../../lib/host-rollback.js";
import { global as logger } from "../../logger.js";

afterEach(() => vi.restoreAllMocks());

const wrappedDatabaseFailure = () => {
	const secret = "private-host-configuration";
	const query = `update proxy_host set meta = '${secret}${"x".repeat(20000)}'`;
	const nativeError = Object.assign(new Error(query), {
		code: "ER_CHECKREAD",
		errno: 1020,
		sqlState: "HY000",
		sql: query,
		sqlMessage: `Record has changed: ${secret}`,
	});
	return new dbErrors.DBError({ nativeError, client: "mysql" });
};

describe("host rollback error handling", () => {
	it("restores and reloads in order before rejecting with the identical original error", async () => {
		const original = new errs.ConfigurationError("Host activation failed");
		const order = [];
		const log = vi.spyOn(logger, "error").mockImplementation(() => {});
		await expect(
			rethrowAfterHostRollback(original, {
				hostId: 7,
				operation: "update",
				restore: async () => order.push("restore"),
				reload: async () => order.push("reload"),
			}),
		).rejects.toBe(original);
		expect(order).toEqual(["restore", "reload"]);
		expect(log).not.toHaveBeenCalled();
	});

	it("retains both failures privately and logs the wrapped native code without a long query or secret", async () => {
		const original = new errs.ConfigurationError("activation-secret");
		const rollback = wrappedDatabaseFailure();
		const restore = vi.fn().mockRejectedValue(rollback);
		const reload = vi.fn();
		const log = vi.spyOn(logger, "error").mockImplementation(() => {});
		const failure = await rethrowAfterHostRollback(original, {
			hostId: 58,
			operation: "update",
			restore,
			reload,
		}).catch((error) => error);
		expect(failure).toBeInstanceOf(errs.InternalError);
		expect(failure.public).toBe(false);
		expect(failure.message).toContain("rollback failed");
		expect(failure.message).not.toContain("restored");
		expect(failure.previous).toBe(original);
		expect(failure.cause).toBe(rollback);
		expect(Object.keys(failure)).not.toContain("previous");
		expect(Object.keys(failure)).not.toContain("cause");
		expect(reload).not.toHaveBeenCalled();
		expect(log).toHaveBeenCalledOnce();
		const line = log.mock.calls[0][0];
		expect(line).toBe(
			'[Host rollback] {"host_id":58,"operation":"update","phase":"restore","original":{"name":"ConfigurationError"},"rollback":{"name":"DBError","code":"ER_CHECKREAD","errno":1020,"sqlState":"HY000"}}',
		);
		expect(line.length).toBeLessThan(512);
		for (const output of [line, JSON.stringify(failure), failure.stack]) {
			expect(output).not.toContain("private-host-configuration");
			expect(output).not.toContain("activation-secret");
			expect(output).not.toContain("update proxy_host");
		}
	});

	it("identifies a failed recovery reload after the snapshot was restored", async () => {
		const original = new errs.ConfigurationError("candidate rejected");
		const rollback = new errs.CommandError("secret nginx configuration", 1);
		const restore = vi.fn().mockResolvedValue(undefined);
		const reload = vi.fn().mockRejectedValue(rollback);
		const log = vi.spyOn(logger, "error").mockImplementation(() => {});
		const failure = await rethrowAfterHostRollback(original, {
			hostId: 7,
			operation: "disable",
			restore,
			reload,
		}).catch((error) => error);
		expect(restore).toHaveBeenCalledOnce();
		expect(reload).toHaveBeenCalledOnce();
		expect(failure.previous).toBe(original);
		expect(failure.cause).toBe(rollback);
		expect(log.mock.calls[0][0]).toContain('"phase":"reload"');
		expect(log.mock.calls[0][0]).toContain('"name":"CommandError"');
		expect(log.mock.calls[0][0]).not.toContain("secret nginx");
	});

	it("bounds nested causes, rejects arbitrary identifiers and handles error cycles", async () => {
		const rollback = {
			name: "PRIVATE_SECRET",
			code: "PRIVATE_SECRET",
			errno: 999999999,
			sqlState: "secret state",
			message: "private message",
		};
		rollback.cause = rollback;
		rollback.previous = { nativeError: Object.assign(new Error("secret query"), { code: "23505" }) };
		const log = vi.spyOn(logger, "error").mockImplementation(() => {});
		await expect(
			rethrowAfterHostRollback(new Error("original secret"), {
				hostId: Number.NaN,
				operation: "secret operation",
				restore: async () => {
					throw rollback;
				},
				reload: vi.fn(),
			}),
		).rejects.toBeInstanceOf(errs.InternalError);
		expect(log.mock.calls[0][0]).toBe(
			'[Host rollback] {"host_id":null,"operation":"unknown","phase":"restore","original":{"name":"Error"},"rollback":{"name":"Error","code":"23505"}}',
		);
	});

	it("keeps both host failures even when the diagnostic log sink throws", async () => {
		const original = new errs.ConfigurationError("activation failed");
		const rollback = wrappedDatabaseFailure();
		vi.spyOn(logger, "error").mockImplementation(() => {
			throw new Error("log sink unavailable");
		});
		const failure = await rethrowAfterHostRollback(original, {
			hostId: 7,
			operation: "restore",
			restore: vi.fn().mockRejectedValue(rollback),
			reload: vi.fn(),
		}).catch((error) => error);
		expect(failure).toBeInstanceOf(errs.InternalError);
		expect(failure.previous).toBe(original);
		expect(failure.cause).toBe(rollback);
	});
});
