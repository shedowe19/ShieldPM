import { createServer } from "node:http";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ insert: vi.fn(), error: vi.fn() }));
vi.mock("../../lib/config.js", () => ({ isSqlite: () => false }));
vi.mock("../../lib/helpers.js", () => ({ castJsonIfNeed: (column) => column }));
vi.mock("../../models/audit-log.js", () => ({ default: { query: () => ({ insert: mocks.insert }) } }));
vi.mock("../../logger.js", () => ({
	global: { error: mocks.error, info: vi.fn(), warn: vi.fn() },
}));

import auditLog from "../../internal/audit-log.js";
import { requestContext, runWithRequestContext } from "../../lib/request-context.js";

const claims = { sid: "family-42", jti: "jti-abc", attrs: { id: 7 } };
const access = {
	token: {
		getUserId: (fallback = 0) => claims.attrs?.id ?? fallback,
		get: (key) => claims[key] ?? null,
	},
};
const token = `e30.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.signature`;

let server;
let origin;

beforeAll(async () => {
	const inner = express();
	inner.set("trust proxy", 1);
	inner.use(requestContext());
	inner.get("/audit", async (_req, res) => {
		const row = await auditLog.add(access, {
			action: "updated",
			object_type: "proxy-host",
			object_id: 5,
			meta: { name: "Example" },
		});
		res.json({ row });
	});
	server = createServer(inner);
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	origin = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
	await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
	mocks.insert.mockReset().mockImplementation(async (row) => ({ id: 1, ...row }));
	mocks.error.mockReset();
});

describe("audit request context", () => {
	it("writes ip, user agent, request id and session id from the request without changing the call site", async () => {
		const response = await fetch(`${origin}/audit`, {
			headers: {
				Authorization: `Bearer ${token}`,
				"User-Agent": "ShieldPM Test Agent",
				"X-Request-ID": "req-abc-12345",
				"X-Forwarded-For": "198.51.100.7",
			},
		});
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(response.headers.get("x-request-id")).toBe("req-abc-12345");
		expect(mocks.insert).toHaveBeenCalledWith(
			expect.objectContaining({
				user_id: 7,
				action: "updated",
				object_type: "proxy-host",
				object_id: 5,
				ip: "198.51.100.7",
				user_agent: "ShieldPM Test Agent",
				session_id: "family-42",
				request_id: "req-abc-12345",
				outcome: "success",
				actor_user_id: 7,
				actor_type: "user",
				jti: "jti-abc",
			}),
		);
		expect(body.row).toMatchObject({ request_id: "req-abc-12345", ip: "198.51.100.7" });
	});

	it("replaces an invalid correlation id instead of trusting client input", async () => {
		const response = await fetch(`${origin}/audit`, {
			headers: { Authorization: `Bearer ${token}`, "X-Request-ID": "short" },
		});
		const generated = response.headers.get("x-request-id");

		expect(generated).toMatch(/^[0-9a-f-]{36}$/);
		expect(mocks.insert).toHaveBeenCalledWith(
			expect.objectContaining({ request_id: generated, ip: expect.any(String) }),
		);
	});

	it("keeps the main operation committed when the audit insert fails", async () => {
		mocks.insert.mockRejectedValue(new Error("audit table locked"));
		const response = await fetch(`${origin}/audit`, {
			headers: { Authorization: `Bearer ${token}` },
		});
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.row).toBeNull();
		expect(mocks.error).toHaveBeenCalledWith(expect.stringContaining('Failed to persist "updated" event'));
	});

	it("records the impersonator as actor while the target user keeps the user_id", async () => {
		const impersonated = {
			token: {
				getUserId: () => 7,
				get: (key) => (key === "act" ? { sub: 1 } : key === "attrs" ? { id: 7 } : null),
			},
		};
		await auditLog.add(impersonated, { action: "updated", object_type: "user", object_id: 7 });

		expect(mocks.insert).toHaveBeenCalledWith(
			expect.objectContaining({
				user_id: 7,
				actor_user_id: 1,
				actor_type: "impersonated",
			}),
		);
	});

	it("marks actions without an authenticated token as system instead of trusting the fallback user", async () => {
		const system = { token: { getUserId: () => 1, get: () => null } };
		await auditLog.add(system, { action: "updated", object_type: "setting", object_id: 0 });

		expect(mocks.insert).toHaveBeenCalledWith(
			expect.objectContaining({ user_id: 1, actor_user_id: null, actor_type: "system" }),
		);
	});

	it("supports synthetic contexts for background jobs", async () => {
		await runWithRequestContext({ ip: "203.0.113.5", requestId: "job-12345678" }, () =>
			auditLog.add(access, { action: "created", object_type: "setting", object_id: 1 }),
		);

		expect(mocks.insert).toHaveBeenCalledWith(
			expect.objectContaining({ ip: "203.0.113.5", request_id: "job-12345678" }),
		);
	});
});
