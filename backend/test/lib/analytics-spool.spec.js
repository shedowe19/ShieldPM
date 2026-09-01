import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DurableAnalyticsSpool } from "../../lib/analytics-spool.js";

const event = (time = "2026-08-31T20:00:00.000Z") => ({
	host_id: 7,
	time,
	method: "GET",
	path: "/health",
	status: 200,
	bytes: 42,
	ip: "192.0.2.1",
	country_code: "DE",
	referer: null,
	user_agent: "test",
	duration: 12,
});

describe("DurableAnalyticsSpool", () => {
	let directory;
	let spoolPath;

	beforeEach(() => {
		directory = fs.mkdtempSync(path.join(os.tmpdir(), "shieldpm-analytics-spool-"));
		spoolPath = path.join(directory, "spool.ndjson");
	});

	afterEach(() => {
		fs.rmSync(directory, { force: true, recursive: true });
	});

	it("fsyncs every accepted NDJSON record and replays it after an unclean close", () => {
		const fsyncSpy = vi.spyOn(fs, "fsyncSync");
		const first = new DurableAnalyticsSpool(spoolPath);
		first.open();
		const appended = first.append(event());
		expect(appended.sequence).toBe(1);
		expect(fsyncSpy).toHaveBeenCalled();
		first.close();

		const replay = new DurableAnalyticsSpool(spoolPath);
		replay.open();
		expect(replay.peek(10)).toEqual([
			expect.objectContaining({ sequence: 1, event: expect.objectContaining({ host_id: 7, path: "/health" }) }),
		]);
		replay.close();
		fsyncSpy.mockRestore();
	});

	it("checkpoints before compaction and never replays acknowledged records", () => {
		const spool = new DurableAnalyticsSpool(spoolPath);
		spool.open();
		spool.append(event());
		spool.append(event("2026-08-31T20:01:00.000Z"));
		spool.markCommitted(1);
		expect(spool.pendingCount).toBe(1);
		expect(spool.compact(true)).toBe(true);
		expect(spool.getReplayFloor()).toBe(2);
		spool.close();

		const replay = new DurableAnalyticsSpool(spoolPath);
		replay.open();
		expect(replay.peek(10).map((record) => record.sequence)).toEqual([2]);
		replay.close();
	});

	it("truncates only a torn final write while rejecting integrity failures in complete records", () => {
		const spool = new DurableAnalyticsSpool(spoolPath);
		spool.open();
		spool.append(event());
		spool.close();
		fs.appendFileSync(spoolPath, '{"version":1,"sequence":2');

		const recovered = new DurableAnalyticsSpool(spoolPath);
		recovered.open();
		expect(recovered.pendingCount).toBe(1);
		recovered.close();

		const lines = fs.readFileSync(spoolPath, "utf8").trimEnd().split("\n");
		const tampered = JSON.parse(lines[0]);
		tampered.event.bytes++;
		fs.writeFileSync(spoolPath, `${JSON.stringify(tampered)}\n`);
		const invalid = new DurableAnalyticsSpool(spoolPath);
		expect(() => invalid.open()).toThrow(/integrity validation/);
	});

	it("enforces record and total spool bounds without exceeding the configured file size", () => {
		const spool = new DurableAnalyticsSpool(spoolPath, { maxBytes: 600, recordMaxBytes: 450 });
		spool.open();
		expect(() => spool.append({ ...event(), user_agent: "x".repeat(1000) })).toThrow(/RECORD_MAX_BYTES/);
		spool.append(event());
		expect(() => spool.append(event("2026-08-31T20:01:00.000Z"))).toThrow(/SPOOL_MAX_BYTES/);
		expect(fs.statSync(spoolPath).size).toBeLessThanOrEqual(600);
		spool.close();
	});

	it("rejects symlink and hard-link spool targets", () => {
		const target = path.join(directory, "target");
		fs.writeFileSync(target, "");
		fs.symlinkSync(target, spoolPath);
		expect(() => new DurableAnalyticsSpool(spoolPath).open()).toThrow(/symbolic link/);
		fs.unlinkSync(spoolPath);
		fs.linkSync(target, spoolPath);
		expect(() => new DurableAnalyticsSpool(spoolPath).open()).toThrow(/single-link/);
	});

	it("rejects a symlinked immediate parent directory and relative spool paths", () => {
		const realDirectory = path.join(directory, "real");
		const linkedDirectory = path.join(directory, "linked");
		fs.mkdirSync(realDirectory);
		fs.symlinkSync(realDirectory, linkedDirectory);
		expect(() => new DurableAnalyticsSpool(path.join(linkedDirectory, "spool.ndjson")).open()).toThrow(
			/symbolic links/,
		);
		const nestedDirectory = path.join(realDirectory, "nested");
		fs.mkdirSync(nestedDirectory);
		expect(() => new DurableAnalyticsSpool(path.join(linkedDirectory, "nested", "spool.ndjson")).open()).toThrow(
			/symbolic links/,
		);
		expect(() => new DurableAnalyticsSpool("relative.ndjson")).toThrow(/must be absolute/);
	});
});
