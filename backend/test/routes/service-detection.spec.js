import express from "express";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/express/jwt-decode.js", () => ({ default: () => (_req, _res, next) => next() }));

import router from "../../routes/services.js";

describe("service detection query validation", () => {
	let server;
	let origin;
	beforeAll(async () => {
		server = express().use(router).listen(0, "127.0.0.1");
		await new Promise((resolve) => server.once("listening", resolve));
		origin = `http://127.0.0.1:${server.address().port}`;
	});
	afterAll(async () => {
		server.closeAllConnections();
		await new Promise((resolve) => server.close(resolve));
	});
	it.each(["port=3000junk", "port=3000&hostname=x&hostname=y", "port=65536", "port=0"])(
		"rejects malformed input %s",
		async (query) => {
			expect((await fetch(`${origin}/detect?${query}`)).status).toBe(400);
		},
	);
	it("still detects a valid service", async () => {
		const response = await fetch(`${origin}/detect?port=3000&hostname=grafana.example.test`);
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ name: "grafana" });
	});
});
