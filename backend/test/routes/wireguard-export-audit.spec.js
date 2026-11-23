import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	audit: vi.fn(),
	config: vi.fn(),
	qrcode: vi.fn(),
	peer: { id: 4, name: "laptop", owner_user_id: 1 },
}));

vi.mock("../../internal/audit-log.js", () => ({ default: { add: state.audit } }));
vi.mock("../../internal/wireguard.js", () => ({
	default: { generateClientConfig: state.config, generateQRCode: state.qrcode },
}));
vi.mock("../../lib/config.js", () => ({ isDemoMode: () => false }));
vi.mock("../../lib/express/jwt-decode.js", () => ({
	default: () => (_req, res, next) => {
		res.locals.access = { can: async () => true, token: { getUserId: () => 1 } };
		next();
	},
}));
vi.mock("../../lib/validator/api.js", () => ({ default: async (_schema, data) => data }));
vi.mock("../../logger.js", () => ({ global: { warn: vi.fn(), error: vi.fn() } }));
vi.mock("../../models/wireguard_peer.js", () => {
	const query = {
		where: () => query,
		andWhere: () => query,
		first: async () => state.peer,
	};
	return { default: { query: () => query } };
});
vi.mock("../../schema/index.js", () => ({ getValidationSchema: vi.fn() }));

import { AUDIT_ACTION } from "../../lib/security-events.js";
import wireguard from "../../routes/nginx/wireguard.js";

let server;
let origin;

beforeAll(async () => {
	const app = express();
	app.use(express.json());
	app.use("/api/nginx/wireguard", wireguard);
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
	state.config.mockResolvedValue("[Interface]\nPrivateKey = hidden");
	state.qrcode.mockResolvedValue("data:image/png;base64,hidden");
});

describe("WireGuard export audit", () => {
	it("audits a client config export without the key material", async () => {
		const response = await fetch(`${origin}/api/nginx/wireguard/4/config`);

		expect(response.status).toBe(200);
		const call = state.audit.mock.calls.find(
			([, event]) => event.action === AUDIT_ACTION.WIREGUARD_CONFIG_EXPORTED,
		);
		expect(call?.[1]).toMatchObject({
			object_type: "wireguard-peer",
			object_id: 4,
			outcome: "success",
			meta: { name: "laptop", format: "config" },
		});
		expect(JSON.stringify(call?.[1])).not.toContain("PrivateKey");
	});

	it("audits a QR code export separately from the text config", async () => {
		const response = await fetch(`${origin}/api/nginx/wireguard/4/qrcode`);

		expect(response.status).toBe(200);
		expect(state.audit).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				action: AUDIT_ACTION.WIREGUARD_CONFIG_EXPORTED,
				object_id: 4,
				meta: expect.objectContaining({ format: "qrcode", name: "laptop" }),
			}),
		);
	});
});
