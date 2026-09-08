import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ isSetup: vi.fn(async () => true) }));

vi.mock("../../lib/express/jwt.js", () => ({ default: () => (_req, _res, next) => next() }));
vi.mock("../../lib/express/demo.js", () => ({ default: (_req, _res, next) => next() }));
vi.mock("../../schema/index.js", () => ({ getCompiledSchema: async () => ({}) }));
vi.mock("../../setup.js", () => ({ isSetup: state.isSetup }));
vi.mock("../../logger.js", () => ({ debug: vi.fn(), express: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("../../routes/main.js", async () => {
	const { default: express } = await import("express");
	const router = express.Router();
	router.get("/users", (_req, res) => res.json([]));
	return { default: router };
});

import app from "../../app.js";

describe("global API limiter on the actual Nginx upstream path", () => {
	let server;
	let origin;
	beforeAll(async () => {
		server = app.listen(0, "127.0.0.1");
		await new Promise((resolve) => server.once("listening", resolve));
		origin = `http://127.0.0.1:${server.address().port}`;
	});
	afterAll(async () => {
		server.closeAllConnections();
		await new Promise((resolve) => server.close(resolve));
	});
	it("counts and blocks unprefixed API requests after the configured 500 requests", async () => {
		for (let i = 0; i < 500; i++) {
			const response = await fetch(`${origin}/users`);
			expect(response.status).toBe(200);
			await response.arrayBuffer();
		}
		const rejected = await fetch(`${origin}/users`);
		expect(rejected.status).toBe(429);
		expect(await rejected.json()).toMatchObject({ error: { code: 429 } });
		expect(state.isSetup).not.toHaveBeenCalled();
		const rejectedSetup = await fetch(`${origin}/users`, { method: "POST" });
		expect(rejectedSetup.status).toBe(429);
		await rejectedSetup.arrayBuffer();
		expect(state.isSetup).not.toHaveBeenCalled();
	}, 15000);
});
