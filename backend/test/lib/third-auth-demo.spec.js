import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ enabled: true }));
vi.mock("../../lib/config.js", () => ({ isDemoMode: () => state.enabled }));

import demo from "../../lib/express/demo.js";
import userIdFromMe from "../../lib/express/user-id-from-me.js";

describe("demo account write protection through Express routing", () => {
	let server;
	let origin;
	const write = vi.fn();
	beforeAll(async () => {
		const app = express();
		app.use(demo);
		app.use((_req, res, next) => {
			res.locals.access = { token: { get: () => ({ id: 1 }), getUserId: () => 1 } };
			next();
		});
		app.all("/users/:user_id/*action", userIdFromMe, (req, res) => {
			if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) write(req.params.user_id);
			res.sendStatus(204);
		});
		server = app.listen(0, "127.0.0.1");
		await new Promise((resolve) => server.once("listening", resolve));
		origin = `http://127.0.0.1:${server.address().port}`;
	});
	afterAll(async () => new Promise((resolve) => server.close(resolve)));
	beforeEach(() => {
		state.enabled = true;
		write.mockClear();
	});
	it.each([
		["POST", "/users/me/2fa/totp/setup"],
		["POST", "/users/1/2fa/duo/setup"],
		["POST", "/users/1/2fa/backup-codes/regenerate"],
		["DELETE", "/users/1/2fa/2"],
		["POST", "/users/1/avatar"],
		["PUT", "/users/1ignored/auth"],
		["PUT", "/users/%31/auth"],
		["PUT", "/users/%6de/auth"],
	])("blocks %s %s before any account write", async (method, path) => {
		const response = await fetch(`${origin}${path}`, { method });
		expect(response.status).toBe(403);
		expect(write).not.toHaveBeenCalled();
	});
	it("keeps account reads and normal-mode enrollment available", async () => {
		expect((await fetch(`${origin}/users/1/2fa/methods`)).status).toBe(204);
		expect(write).not.toHaveBeenCalled();
		state.enabled = false;
		expect((await fetch(`${origin}/users/me/2fa/totp/setup`, { method: "POST" })).status).toBe(204);
		expect(write).toHaveBeenCalledWith(1);
	});
});
