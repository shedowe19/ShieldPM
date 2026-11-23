import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	audit: vi.fn(),
	enable: vi.fn(),
	remove: vi.fn(),
}));

vi.mock("../../internal/audit-log.js", () => ({ default: { add: state.audit } }));
vi.mock("../../internal/2fa-service.js", () => ({
	default: {
		verifyAndEnableTotp: state.enable,
		removeTwoFaMethod: state.remove,
	},
}));
vi.mock("../../lib/express/jwt-decode.js", () => ({
	default: () => (_req, res, next) => {
		res.locals.access = { can: async () => true, token: { getUserId: () => 7 } };
		next();
	},
}));
vi.mock("../../lib/express/user-id-from-me.js", () => ({ default: (_req, _res, next) => next() }));
vi.mock("../../models/user-2fa.js", () => ({ default: { query: vi.fn() } }));
vi.mock("../../models/user-2fa-backup-codes.js", () => ({ default: { query: vi.fn() } }));

import { AUDIT_ACTION } from "../../lib/security-events.js";
import twoFa from "../../routes/2fa.js";

let server;
let origin;

beforeAll(async () => {
	const app = express();
	app.use(express.json());
	app.use("/api/users/:user_id/2fa", twoFa);
	server = app.listen(0, "127.0.0.1");
	await new Promise((resolve) => server.once("listening", resolve));
	origin = `http://127.0.0.1:${server.address().port}`;
});
afterAll(async () => {
	server.closeAllConnections();
	await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
	vi.clearAllMocks();
	state.audit.mockResolvedValue({ id: 1 });
	state.enable.mockResolvedValue([]);
	state.remove.mockResolvedValue(true);
});

describe("two-factor audit events", () => {
	it("audits enabling a TOTP factor for the target user", async () => {
		const response = await fetch(`${origin}/api/users/7/2fa/totp/enable`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ code: "123456" }),
		});

		expect(response.status).toBe(200);
		expect(state.audit).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				action: AUDIT_ACTION.TWO_FACTOR_ENABLED,
				object_type: "user",
				object_id: 7,
				user_id: 7,
				meta: { method: "totp" },
			}),
		);
	});

	it("audits removing a second factor without recording its secret", async () => {
		const response = await fetch(`${origin}/api/users/7/2fa/3`, { method: "DELETE" });

		expect(response.status).toBe(204);
		const call = state.audit.mock.calls.find(([, event]) => event.action === AUDIT_ACTION.TWO_FACTOR_DISABLED);
		expect(call?.[1]).toMatchObject({
			object_type: "user",
			object_id: 7,
			user_id: 7,
			meta: { method_id: 3 },
		});
		expect(JSON.stringify(call?.[1])).not.toMatch(/secret|code/i);
	});
});
