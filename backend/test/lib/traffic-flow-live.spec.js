import { describe, expect, it } from "vitest";
import { LIVE_FLOW_LIMIT, LiveFlowBuffer } from "../../lib/traffic-flow-live.js";

const now = 1_800_000_000_000;
const host = () => ({ id: 1, clients: [], targets: [], truncated: false });
const sample = (patch = {}) => {
	const value = {
		host: 1,
		client: "192.0.2.123",
		protocol: "HTTP/1.1",
		supported: true,
		final: false,
		client_sent: 0,
		client_received: 0,
		upstream: "127.0.0.1:8000",
		attempt: 1,
		upstream_sent: 0,
		upstream_received: 0,
		worker: "10-boot",
		request: "42-1",
		time: now / 1000,
		...patch,
	};
	return {
		schema: value.version || 1,
		type: "live_sample",
		generation: value.worker,
		request_id: value.request,
		host: value.host,
		client: value.client,
		time_ms: value.time * 1000,
		monotonic_ms: value.time * 1000,
		protocol: value.protocol,
		supported: value.supported,
		final: value.final,
		client_sent: value.client_sent,
		client_received: value.client_received,
		attempts: [
			{
				id: value.attempt,
				peer: value.upstream,
				sent: value.upstream_sent,
				received: value.upstream_received,
				final: false,
			},
		],
	};
};
const snapshot = (buffer, at = now + 1000) => {
	const result = host();
	buffer.apply([result], at);
	return result;
};
const pair = (buffer) => {
	buffer.ingest(sample(), now);
	buffer.ingest(
		sample({
			time: now / 1000 + 1,
			client_sent: 65536,
			client_received: 1024,
			upstream_sent: 1024,
			upstream_received: 70000,
		}),
		now + 1000,
	);
};

describe("native live flow measured rates", () => {
	it("requires a baseline and measures all four direction counters during an active request", () => {
		const buffer = new LiveFlowBuffer();
		buffer.ingest(sample(), now);
		expect(snapshot(buffer, now).clients[0].current_bytes_per_second).toBeNull();
		pair(buffer);
		const result = snapshot(buffer);
		expect(result.clients[0]).toMatchObject({
			label: "192.0.2.0/24",
			active_requests: 1,
			current_bytes_per_second: 66560,
			rate: {
				upload_bytes_per_second: 1024,
				download_bytes_per_second: 65536,
				window_start: new Date(now).toISOString(),
				window_end: new Date(now + 1000).toISOString(),
			},
		});
		expect(result.targets[0].rate).toMatchObject({
			upload_bytes_per_second: 1024,
			download_bytes_per_second: 70000,
		});
		expect(JSON.stringify([...buffer.requests.values()])).not.toContain("192.0.2.123");
	});
	it("uses the actual interval rather than assuming one second and keeps display smoothing separate", () => {
		const buffer = new LiveFlowBuffer();
		pair(buffer);
		buffer.ingest(sample({ time: now / 1000 + 3, client_sent: 67536, client_received: 1024 }), now + 3000);
		const rate = snapshot(buffer, now + 3000).clients[0].rate;
		expect(rate.bytes_per_second).toBe(1000);
		expect(rate.smoothed_bytes_per_second).toBe(66560 * 0.65 + 1000 * 0.35);
	});
	it("does not derive a rate across counter reset, upstream retry or long sampling gap", () => {
		const buffer = new LiveFlowBuffer();
		pair(buffer);
		buffer.ingest(sample({ time: now / 1000 + 2, client_sent: 10, attempt: 2, upstream_sent: 10 }), now + 2000);
		let result = snapshot(buffer, now + 2000);
		expect(result.clients[0].rate).toBeUndefined();
		expect(result.targets[0].rate).toBeUndefined();
		buffer.ingest(sample({ time: now / 1000 + 7, client_sent: 100 }), now + 7000);
		result = snapshot(buffer, now + 7000);
		expect(result.clients[0].current_bytes_per_second).toBeNull();
	});
	it("rejects out-of-order and malformed native counters without damaging valid samples", () => {
		const buffer = new LiveFlowBuffer();
		pair(buffer);
		for (const patch of [
			{ time: now / 1000 },
			{ client_sent: -1 },
			{ client_sent: 1.5 },
			{ client_sent: Number.MAX_SAFE_INTEGER + 1 },
			{ worker: "x".repeat(101) },
			{ client: "fake" },
			{ host: 0 },
			{ version: 2 },
			{ time: now / 1000 + 90 },
		])
			buffer.ingest(sample(patch), now + 1000);
		expect(snapshot(buffer).clients[0].current_bytes_per_second).toBe(66560);
	});
	it("leaves unsupported protocols unknown and marks mixed known/unknown groups incomplete", () => {
		const buffer = new LiveFlowBuffer();
		pair(buffer);
		buffer.ingest(sample({ request: "42:2", protocol: "HTTP/2", supported: false, client: "192.0.2.66" }), now);
		const result = snapshot(buffer);
		expect(result.clients[0].rate_incomplete).toBe(true);
		expect(result.clients[0].current_bytes_per_second).toBeNull();
	});
	it("never leaks foreign host source freshness or includes foreign rates in authorized totals", () => {
		const buffer = new LiveFlowBuffer();
		buffer.ingest(sample({ host: 2, request: "foreign" }), now);
		const result = host();
		expect(buffer.apply([result], now)).toBe(false);
		expect(result.clients).toEqual([]);
		pair(buffer);
		expect(snapshot(buffer).clients[0].rate.bytes_per_second).toBe(66560);
	});
	it("treats measured zero as zero and missing or stale samples as unknown", () => {
		const buffer = new LiveFlowBuffer();
		buffer.ingest(sample(), now);
		buffer.ingest(sample({ time: now / 1000 + 1 }), now + 1000);
		expect(snapshot(buffer).clients[0].current_bytes_per_second).toBe(0);
		expect(snapshot(buffer, now + 5000).clients).toEqual([]);
		buffer.prune(now + 62000);
		expect(buffer.requests.size).toBe(0);
	});
	it("does not treat delayed delivery as a fresh full interval or sum truncated upstream attempts", () => {
		const buffer = new LiveFlowBuffer();
		pair(buffer);
		buffer.ingest({ ...sample({ time: now / 1000 + 2, client_sent: 70000 }), truncated: true }, now + 2000);
		const result = snapshot(buffer, now + 2000);
		expect(result.truncated).toBe(true);
		expect(result.targets[0].current_bytes_per_second).toBeNull();
		expect(result.targets[0].rate_incomplete).toBe(true);
		const delayed = new LiveFlowBuffer();
		delayed.ingest(sample(), now + 3000);
		expect(snapshot(delayed, now + 4000).clients).toEqual([]);
	});

	it("bounds native records and client groups", () => {
		const buffer = new LiveFlowBuffer();
		for (let index = 0; index < LIVE_FLOW_LIMIT + 10; index++)
			buffer.ingest(sample({ request: String(index), client: `10.${index % 255}.0.1` }), now);
		expect(buffer.requests.size).toBe(LIVE_FLOW_LIMIT);
		const result = snapshot(buffer);
		expect(result.clients).toHaveLength(32);
		expect(result.truncated).toBe(true);
		buffer.clear();
		expect(buffer.requests.size).toBe(0);
	});
});
