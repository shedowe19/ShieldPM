import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import jsonBody from "../../lib/express/json-body.js";
import { normalizeFirewallPolicy } from "../../lib/firewall-policy.js";

describe("firewall JSON request limits", () => {
	let server;
	let origin;
	beforeAll(async () => {
		const app = express();
		app.use(jsonBody);
		app.use((req, res) => res.json({ parsed: true, rules: req.body.meta?.ip_firewall?.denylist.length }));
		app.use((error, _req, res, _next) => res.status(error.status ?? 500).json({ error: error.type }));
		server = await new Promise((resolve) => {
			const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
		});
		origin = `http://127.0.0.1:${server.address().port}`;
	});
	afterAll(async () => {
		server.closeAllConnections();
		await new Promise((resolve) => server.close(resolve));
	});

	const send = (path, body, method = "POST") =>
		fetch(`${origin}${path}`, { method, headers: { "Content-Type": "application/json" }, body });
	const policyBody = (count, reason) =>
		JSON.stringify({
			meta: {
				ip_firewall: normalizeFirewallPolicy({
					enabled: true,
					denylist: Array.from({ length: count }, (_, index) => ({
						address: `2001:db8::${(index + 1).toString(16)}`,
						reason,
					})),
				}),
			},
		});

	it.each([
		["/nginx/proxy-hosts", "POST"],
		["/nginx/proxy-hosts/17", "PUT"],
		["/nginx/proxy-hosts/preview", "POST"],
		["/nginx/proxy-hosts/17/preview", "POST"],
		["/api/nginx/proxy-hosts/17", "PUT"],
	])("accepts valid explained host rules above the default limit at %s", async (path, method) => {
		const body = policyBody(120, "a".repeat(1000));
		expect(Buffer.byteLength(body)).toBeGreaterThan(100 * 1024);
		const response = await send(path, body, method);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ parsed: true, rules: 120 });
	});
	it("accepts the maximum manual policy with escaped explanatory text", async () => {
		const body = policyBody(1000, "\u0001".repeat(1000));
		expect(Buffer.byteLength(body)).toBeGreaterThan(5 * 1024 * 1024);
		const response = await send("/nginx/proxy-hosts", body);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ parsed: true, rules: 1000 });
	});
	it("keeps proxy-host requests bounded at 8 MiB", async () => {
		const response = await send("/nginx/proxy-hosts", JSON.stringify({ text: "a".repeat(8 * 1024 * 1024) }));
		expect(response.status).toBe(413);
		expect(await response.json()).toEqual({ error: "entity.too.large" });
	});
	it.each(["/nginx/firewall-lists", "/api/nginx/firewall-lists/preview"])(
		"preserves the larger list import limit at %s",
		async (path) => {
			const response = await send(path, JSON.stringify({ entries: "a".repeat(9 * 1024 * 1024) }));
			expect(response.status).toBe(200);
		},
	);
	it.each(["/settings", "/nginx/proxy-hosts-extra", "/nginx/firewall-lists-extra"])(
		"retains the default JSON limit at %s",
		async (path) => {
			const response = await send(path, JSON.stringify({ text: "a".repeat(101 * 1024) }));
			expect(response.status).toBe(413);
		},
	);
});
