import fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../models/analytic_count.js", () => ({ default: {} }));
vi.mock("../../models/analytics_logs.js", () => ({ default: {} }));
vi.mock("../../models/proxy_host.js", () => ({ default: {} }));

import { AnalyticsService, resolveIngestStartMode, resolveRetentionConfig } from "../../internal/analytics.js";
import AnalyticsLogs from "../../models/analytics_logs.js";

const line = (path) =>
	`${JSON.stringify({
		body_bytes_sent: 128,
		request_method: "GET",
		request_time: "0.012",
		request_uri: path,
		remote_addr: "198.51.100.7",
		server_name: "app.example.test",
		status: 200,
		time_iso8601: "2026-11-23T10:00:00+00:00",
	})}\n`;

const createStore = () => {
	let state = null;
	return {
		get state() {
			return state;
		},
		load: async () => state,
		save: async (record) => {
			state = { ...record };
		},
	};
};

const createService = (file, store, options = {}) => {
	const service = new AnalyticsService(file, { stateStore: store, startMode: "beginning", ...options });
	service.flush = vi.fn().mockResolvedValue(true);
	return service;
};

let directory;
let logFile;
beforeEach(() => {
	directory = fs.mkdtempSync(join(tmpdir(), "shieldpm-analytics-ingest-"));
	logFile = join(directory, "json_access.log");
});
afterEach(() => {
	fs.rmSync(directory, { force: true, recursive: true });
});

describe("analytics log offset and backfill", () => {
	it("replays lines written while the process was stopped instead of starting at the file end", async () => {
		fs.writeFileSync(logFile, line("/first"));
		const store = createStore();

		const first = createService(logFile, store);
		const firstOffset = await first.resumeFromPersistedOffset();
		expect(first.detailedLogBuffer).toHaveLength(1);
		expect(first.detailedLogBuffer[0].path).toBe("/first");
		expect(firstOffset).toBe(fs.statSync(logFile).size);

		first.detailedLogBuffer = [];
		fs.appendFileSync(logFile, line("/second"));

		const second = createService(logFile, store);
		const secondOffset = await second.resumeFromPersistedOffset();
		expect(second.detailedLogBuffer).toHaveLength(1);
		expect(second.detailedLogBuffer[0].path).toBe("/second");
		expect(secondOffset).toBe(fs.statSync(logFile).size);
		expect(store.state.byte_offset).toBe(secondOffset);
	});

	it("starts at the current end when a previous release already has analytics rows", async () => {
		fs.writeFileSync(logFile, line("/historic"));
		const size = fs.statSync(logFile).size;
		const store = createStore();
		const service = createService(logFile, store);
		vi.spyOn(service, "hasExistingAnalyticsRows").mockResolvedValue(true);

		const offset = await service.resumeFromPersistedOffset();

		expect(offset).toBe(size);
		expect(service.detailedLogBuffer).toHaveLength(0);
		expect(store.state.byte_offset).toBe(size);
	});

	it("treats legacy aggregates as existing data when detail rows were pruned", async () => {
		const service = createService(logFile, createStore());
		const knex = vi.fn((table) => ({
			select: () => ({
				limit: () => ({
					first: async () => (table === "analytic_count" ? { id: 1 } : undefined),
				}),
			}),
		}));
		const originalKnex = AnalyticsLogs.knex;
		AnalyticsLogs.knex = () => knex;
		try {
			await expect(service.hasExistingAnalyticsRows()).resolves.toBe(true);
			expect(knex).toHaveBeenCalledWith("analytics_logs");
			expect(knex).toHaveBeenCalledWith("analytic_count");
		} finally {
			AnalyticsLogs.knex = originalKnex;
		}
	});

	it("persists only the offset covered by the committed batch", async () => {
		fs.writeFileSync(logFile, line("/one"));
		const committedSize = fs.statSync(logFile).size;
		const store = createStore();
		const service = new AnalyticsService(logFile, { stateStore: store, startMode: "beginning" });
		service.tail = { currentCursorPos: committedSize, buffer: "" };
		service.detailedLogBuffer = [{ path: "/one" }];
		service.flushBatch = async () => {
			fs.appendFileSync(logFile, line("/new"));
			service.tail.currentCursorPos = fs.statSync(logFile).size;
		};

		await service.flush();

		expect(store.state.byte_offset).toBe(committedSize);
	});

	it("detects truncation and replays the current file from its start", async () => {
		fs.writeFileSync(logFile, line("/one") + line("/two"));
		const store = createStore();
		const first = createService(logFile, store);
		await first.resumeFromPersistedOffset();
		first.detailedLogBuffer = [];

		fs.truncateSync(logFile, 0);
		fs.appendFileSync(logFile, line("/after-truncate"));

		const second = createService(logFile, store);
		await second.resumeFromPersistedOffset();
		expect(second.detailedLogBuffer.map((row) => row.path)).toEqual(["/after-truncate"]);
	});

	it("replays the rotated file tail before the new log file", async () => {
		fs.writeFileSync(logFile, line("/before-rotation"));
		const store = createStore();
		const first = createService(logFile, store);
		await first.resumeFromPersistedOffset();
		first.detailedLogBuffer = [];

		fs.renameSync(logFile, `${logFile}.1`);
		fs.appendFileSync(`${logFile}.1`, line("/rotated-tail"));
		fs.writeFileSync(logFile, line("/after-rotation"));

		const second = createService(logFile, store);
		await second.resumeFromPersistedOffset();
		expect(second.detailedLogBuffer.map((row) => row.path)).toEqual(["/rotated-tail", "/after-rotation"]);
	});

	it("replays the unread tail from a copytruncate rotation", async () => {
		fs.writeFileSync(logFile, line("/before-copytruncate"));
		const store = createStore();
		const first = createService(logFile, store);
		await first.resumeFromPersistedOffset();
		first.detailedLogBuffer = [];

		fs.appendFileSync(logFile, line("/unread-tail"));
		fs.copyFileSync(logFile, `${logFile}.1`);
		fs.truncateSync(logFile, 0);
		fs.appendFileSync(logFile, line("/after-copytruncate"));

		const second = createService(logFile, store);
		await second.resumeFromPersistedOffset();
		expect(second.detailedLogBuffer.map((row) => row.path)).toEqual(["/unread-tail", "/after-copytruncate"]);
	});

	it("honours an explicit first-run start at the current end without silently replaying history", async () => {
		fs.writeFileSync(logFile, line("/history"));
		const store = createStore();
		const service = createService(logFile, store, { startMode: "end" });

		const offset = await service.resumeFromPersistedOffset();
		expect(offset).toBe(fs.statSync(logFile).size);
		expect(service.detailedLogBuffer).toHaveLength(0);
		expect(store.state.byte_offset).toBe(fs.statSync(logFile).size);
	});
});

describe("analytics parser deduplication", () => {
	const anubisLine = (requestTime = "0.010") =>
		JSON.stringify({
			body_bytes_sent: 128,
			request_method: "GET",
			request_time: requestTime,
			request_uri: "/protected",
			remote_addr: "198.51.100.7",
			server_name: "anubis.example.test",
			status: 200,
			time_iso8601: "2026-11-23T10:00:00+00:00",
		});

	it("counts an Anubis frontend request and its internal hop once", () => {
		const service = createService(logFile, createStore());
		service.anubisHostIds.add(0);

		service.processLine(anubisLine("0.040"));
		service.processLine(anubisLine("0.012"));

		expect(service.detailedLogBuffer).toHaveLength(1);
		expect(service.anubisDuplicatesDropped).toBe(1);
		const aggregation = [...service.aggregationBuffer.values()].reduce((sum, entry) => sum + entry.count, 0);
		expect(aggregation).toBe(1);
	});

	it("keeps two identical requests on hosts without Anubis", () => {
		const service = createService(logFile, createStore());

		service.processLine(anubisLine());
		service.processLine(anubisLine());

		expect(service.detailedLogBuffer).toHaveLength(2);
		expect(service.anubisDuplicatesDropped).toBe(0);
	});

	it("drops unix-socket requests from the global JSON access log", () => {
		const service = createService(logFile, createStore());
		service.processLine(
			JSON.stringify({
				body_bytes_sent: 5,
				request_method: "GET",
				request_uri: "/internal",
				remote_addr: "unix:",
				server_name: "app.example.test",
				status: 200,
				time_iso8601: "2026-11-23T10:00:00+00:00",
			}),
		);

		expect(service.detailedLogBuffer).toHaveLength(0);
		expect(service.internalHopDroppedCount).toBe(1);
	});
});

describe("analytics configuration validation", () => {
	it("falls back to safe retention defaults for negative, non-numeric and out-of-range values", () => {
		expect(
			resolveRetentionConfig({
				ANALYTICS_AGGREGATION_RETENTION_DAYS: "24h",
				ANALYTICS_DETAILED_RETENTION_HOURS: "-1",
			}),
		).toEqual({ aggregationDays: 35, detailedHours: 24 });
		expect(
			resolveRetentionConfig({
				ANALYTICS_AGGREGATION_RETENTION_DAYS: "0",
				ANALYTICS_DETAILED_RETENTION_HOURS: "0",
			}),
		).toEqual({ aggregationDays: 35, detailedHours: 24 });
		expect(
			resolveRetentionConfig({
				ANALYTICS_AGGREGATION_RETENTION_DAYS: "3650",
				ANALYTICS_DETAILED_RETENTION_HOURS: "8760",
			}),
		).toEqual({ aggregationDays: 3650, detailedHours: 8760 });
	});

	it("defaults an unknown ingestion start mode to the beginning", () => {
		expect(resolveIngestStartMode(undefined)).toBe("beginning");
		expect(resolveIngestStartMode("end")).toBe("end");
		expect(resolveIngestStartMode("tailfile")).toBe("beginning");
	});
});
