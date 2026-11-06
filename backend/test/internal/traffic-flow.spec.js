import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), createSocket: vi.fn() }));
vi.mock("../../models/proxy_host.js", () => ({ default: { query: mocks.query } }));
vi.mock("node:dgram", () => ({ default: { createSocket: mocks.createSocket } }));

import service from "../../internal/traffic-flow.js";
import errs from "../../lib/error.js";
import { FlowBuffer } from "../../lib/traffic-flow.js";

let socket;
let builder;
let access;
const host = {
	id: 1,
	domain_names: ["test.example"],
	enabled: true,
	forward_scheme: "http",
	forward_host: "origin.example",
	forward_port: 80,
};
beforeEach(() => {
	vi.stubEnv("TRAFFIC_FLOW_ENABLED", "true");
	vi.stubEnv("TRAFFIC_FLOW_LIVE_ENABLED", "false");
	socket = Object.assign(new EventEmitter(), { bind: vi.fn(), close: vi.fn(), unref: vi.fn() });
	mocks.createSocket.mockReturnValue(socket);
	builder = {
		where: vi.fn(),
		select: vi.fn(),
		withGraphFetched: vi.fn(),
		orderBy: vi.fn(),
		limit: vi.fn(),
		andWhere: vi.fn(),
		// biome-ignore lint/suspicious/noThenProperty: Objection query builders are intentionally thenable.
		then: (resolve) => Promise.resolve([host]).then(resolve),
	};
	for (const name of ["where", "select", "withGraphFetched", "orderBy", "limit", "andWhere"])
		builder[name].mockReturnValue(builder);
	mocks.query.mockReturnValue(builder);
	access = { can: vi.fn().mockResolvedValue({ permission_visibility: "user" }), token: { getUserId: () => 7 } };
});
afterEach(() => {
	service.stop();
	vi.unstubAllEnvs();
	vi.useRealTimers();
	vi.restoreAllMocks();
	vi.clearAllMocks();
});
const send = (overrides = {}) =>
	socket.emit(
		"message",
		Buffer.from(
			`prefix shieldpm_flow: ${JSON.stringify({ host: 1, client: "192.0.2.1", time: String(Date.now() / 1000), bytes: "5", upstream: "127.0.0.1:80", ...overrides })}`,
		),
		{ address: "127.0.0.1" },
	);
describe("flow service access and receiver", () => {
	it("measures native active transfers only after two authorized samples and falls back when stale", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-11-05T12:00:00Z"));
		vi.stubEnv("TRAFFIC_FLOW_LIVE_ENABLED", "true");
		service.start();
		const native = (hostId, bytes) =>
			socket.emit(
				"message",
				Buffer.from(
					JSON.stringify({
						schema: 1,
						type: "live_sample",
						generation: "worker-1",
						request_id: `req-${hostId}`,
						host: hostId,
						client: "192.0.2.88",
						protocol: "HTTP/1.1",
						supported: true,
						time_ms: Date.now(),
						monotonic_ms: Date.now(),
						client_received: 0,
						client_sent: bytes,
						final: false,
						attempts: [],
						truncated: false,
					}),
				),
				{ address: "127.0.0.1" },
			);
		native(2, 0);
		expect((await service.get(access)).capabilities.current_rates).toBe(false);
		native(1, 0);
		expect((await service.get(access)).hosts[0].clients[0].current_bytes_per_second).toBeNull();
		vi.advanceTimersByTime(1000);
		native(1, 65536);
		const result = await service.get(access);
		expect(result).toMatchObject({
			capabilities: { current_rates: true, source: "native_http_transport" },
			poll_interval_ms: 1000,
		});
		expect(result.hosts[0].clients[0].rate).toMatchObject({
			download_bytes_per_second: 65536,
			upload_bytes_per_second: 0,
		});
		vi.advanceTimersByTime(4000);
		expect(await service.get(access)).toMatchObject({
			capabilities: { current_rates: false },
			poll_interval_ms: 1000,
		});
	});

	it("sweeps expired prefixes even when no packets or viewers arrive and stops the timer", () => {
		vi.useFakeTimers();
		const prune = vi.spyOn(FlowBuffer.prototype, "prune");
		service.start();
		vi.advanceTimersByTime(5000);
		expect(prune).toHaveBeenCalledTimes(1);
		service.stop();
		vi.advanceTimersByTime(5000);
		expect(prune).toHaveBeenCalledTimes(1);
	});
	it("does not start a listener or expose hosts when disabled", async () => {
		vi.stubEnv("TRAFFIC_FLOW_ENABLED", "false");
		service.start();
		expect(mocks.createSocket).not.toHaveBeenCalled();
		expect(await service.get(access)).toMatchObject({
			enabled: false,
			hosts: [],
			collector: { state: "disabled", last_observed_at: null },
		});
	});

	it("requires both current permissions before querying even when disabled", async () => {
		vi.stubEnv("TRAFFIC_FLOW_ENABLED", "false");
		access.can.mockRejectedValue(new errs.PermissionError());
		await expect(service.get(access)).rejects.toBeInstanceOf(errs.PermissionError);
		expect(mocks.query).not.toHaveBeenCalled();
	});
	it("enforces owner visibility and revalidates a revoked permission on every request", async () => {
		await service.get(access);
		expect(access.can.mock.calls).toEqual([["analytics:list"], ["proxy_hosts:list"]]);
		expect(builder.andWhere).toHaveBeenCalledWith("owner_user_id", 7);
		access.can.mockRejectedValue(new errs.PermissionError());
		await expect(service.get(access)).rejects.toBeInstanceOf(errs.PermissionError);
	});
	it("starts one loopback listener, receives completions and discards malformed packets", async () => {
		service.start();
		service.start();
		expect(mocks.createSocket).toHaveBeenCalledTimes(1);
		expect(socket.bind).toHaveBeenCalledWith(15149, "127.0.0.1");
		socket.emit("message", Buffer.from("shieldpm_flow: bad JSON"), { address: "127.0.0.1" });
		send();
		const result = await service.get(access);
		expect(result.collector.state).toBe("receiving");
		expect(result.hosts[0].clients[0].completed_bytes).toBe(5);
		expect(result.capabilities.current_rates).toBe(false);
		expect(result.sample_complete).toBe(false);
		service.stop();
		expect(socket.close).toHaveBeenCalledTimes(1);
		expect((await service.get(access)).hosts[0].clients).toEqual([]);
	});
	it("does not reveal another host's activity or last-observed timestamp", async () => {
		service.start();
		send({ host: 2 });
		const result = await service.get(access);
		expect(result.collector).toEqual({ state: "waiting", last_observed_at: null });
		expect(result.hosts[0].clients).toEqual([]);
	});
	it("reports receiver failure and clears observations without throwing", async () => {
		service.start();
		send();
		socket.emit("error", new Error("bind failure"));
		const result = await service.get(access);
		expect(result.collector.state).toBe("error");
		expect(result.hosts[0].clients).toEqual([]);
	});
});

it("polls native bootstrap every second without leaking hidden-host arrival timestamps", async () => {
	vi.stubEnv("TRAFFIC_FLOW_LIVE_ENABLED", "true");
	service.start();
	const result = await service.get(access);
	expect(result.poll_interval_ms).toBe(1000);
	expect(result.diagnostics).toMatchObject({
		live_enabled: true,
		native_last_observed_at: null,
		reason: "native_not_received",
	});
});
it("distinguishes completion collection from disabled native instrumentation", async () => {
	service.start();
	send();
	const result = await service.get(access);
	expect(result.diagnostics.reason).toBe("native_disabled");
	expect(result.hosts[0].clients[0].unknown_reason).toBe("native_disabled");
	expect(result.hosts[0].targets[0].unknown_reason).toBe("not_measured");
});

it("reports fresh unsupported native observations without calling them stale", async () => {
	vi.stubEnv("TRAFFIC_FLOW_LIVE_ENABLED", "true");
	service.start();
	socket.emit(
		"message",
		Buffer.from(
			JSON.stringify({
				schema: 1,
				type: "live_sample",
				host: 1,
				client: "192.0.2.9",
				generation: "worker",
				request_id: "unsupported",
				protocol: "unsupported",
				supported: false,
				time_ms: Date.now(),
				monotonic_ms: 100,
				client_sent: null,
				client_received: null,
				attempts: [],
			}),
		),
		{ address: "127.0.0.1" },
	);
	expect((await service.get(access)).diagnostics.reason).toBe("unsupported");
});
