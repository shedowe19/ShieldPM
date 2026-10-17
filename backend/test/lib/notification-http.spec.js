import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn(), body: "" }));
vi.mock("node:dns/promises", () => ({ default: { lookup: state.lookup } }));
vi.mock("node:https", () => ({ default: { request: state.request } }));

import { deliverNotification, validateNotificationUrl } from "../../lib/notification-http.js";

const payload = {
	event: "incident.opened",
	host_id: 1,
	incident_id: 2,
	state: "down",
	message: "HTTP 503",
	checked_at: "2026-10-17T00:00:00.000Z",
};
const target = { type: "webhook" };
const secret = { url: "https://notify.example/private-webhook", token: "synthetic-token" };
describe("notification HTTPS transport", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		state.body = "";
		state.lookup.mockResolvedValue([{ address: "1.1.1.1", family: 4 }]);
		state.request.mockImplementation((_options, response) => {
			const request = Object.assign(new EventEmitter(), {
				end: vi.fn((body) => {
					state.body = body;
					queueMicrotask(() =>
						response(Object.assign(new EventEmitter(), { statusCode: 204, destroy: vi.fn() })),
					);
				}),
			});
			return request;
		});
	});
	afterEach(() => vi.useRealTimers());
	it.each([
		"http://notify.example/topic",
		"https://127.0.0.1/topic",
		"https://[::ffff:127.0.0.1]/topic",
		"https://169.254.169.254/",
		"https://user:password@notify.example/",
		"https://notify.example/#secret",
	])("rejects unsafe endpoint %s before networking", async (url) => {
		await expect(deliverNotification(target, { url }, payload, 3)).rejects.toThrow();
		expect(state.request).not.toHaveBeenCalled();
	});
	it("pins validated DNS answers, TLS identity and idempotency without leaking bearer tokens to the body", async () => {
		await expect(deliverNotification(target, secret, payload, 3)).resolves.toBe(204);
		const options = state.request.mock.calls[0][0];
		expect(options).toMatchObject({
			hostname: "shieldpm-notification.invalid",
			servername: "notify.example",
			agent: false,
			rejectUnauthorized: true,
			method: "POST",
			path: "/private-webhook",
			headers: {
				Host: "notify.example",
				Authorization: "Bearer synthetic-token",
				"Idempotency-Key": "shieldpm-delivery-3",
			},
		});
		state.lookup.mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
		const answer = vi.fn();
		options.lookup(options.hostname, { all: true }, answer);
		expect(answer).toHaveBeenCalledWith(null, [{ address: "1.1.1.1", family: 4 }]);
		expect(state.lookup).toHaveBeenCalledOnce();
		expect(state.body).not.toContain("synthetic-token");
		expect(JSON.parse(state.body)).toEqual(payload);
	});
	it("rejects mixed public/private DNS without connecting", async () => {
		state.lookup.mockResolvedValue([
			{ address: "1.1.1.1", family: 4 },
			{ address: "192.168.1.1", family: 4 },
		]);
		await expect(deliverNotification(target, secret, payload, 3)).rejects.toThrow("only to public");
		expect(state.request).not.toHaveBeenCalled();
	});
	it("does not follow redirects or expose their Location", async () => {
		state.request.mockImplementation((_options, response) =>
			Object.assign(new EventEmitter(), {
				end: () =>
					queueMicrotask(() =>
						response(
							Object.assign(new EventEmitter(), {
								statusCode: 302,
								headers: { location: "https://private-token.example" },
								destroy: vi.fn(),
							}),
						),
					),
			}),
		);
		await expect(deliverNotification(target, secret, payload, 3)).rejects.toThrow(
			"Notification endpoint returned HTTP 302",
		);
		expect(state.request).toHaveBeenCalledOnce();
	});
	it("encodes Discord without mentions and ntfy as text", async () => {
		validateNotificationUrl("https://discord.com/api/webhooks/123/synthetic-token", "discord");
		await deliverNotification(
			{ type: "discord" },
			{ url: "https://discord.com/api/webhooks/123/synthetic-token" },
			payload,
			3,
		);
		expect(JSON.parse(state.body)).toMatchObject({ allowed_mentions: { parse: [] } });
		await deliverNotification({ type: "ntfy" }, secret, payload, 4);
		expect(state.body).toContain("ShieldPM DOWN");
		expect(state.request.mock.calls[1][0].headers["Content-Type"]).toMatch(/^text\/plain/);
	});
	it("has a deadline covering a stalled DNS lookup and does not connect after cancellation", async () => {
		const controller = new AbortController();
		state.lookup.mockReturnValue(new Promise(() => {}));
		const pending = deliverNotification(target, secret, payload, 3, controller.signal);
		controller.abort();
		await expect(pending).rejects.toThrow("timed out");
		expect(state.request).not.toHaveBeenCalled();
	});
});
