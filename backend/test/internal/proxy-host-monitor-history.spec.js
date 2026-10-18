import { performance } from "node:perf_hooks";
import { Model } from "objection";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPostgres } from "../helpers/postgres.js";

const state = vi.hoisted(() => ({ db: null, engine: "sqlite" }));
vi.mock("../../db.js", async () => {
	const { default: knex } = await import("knex");
	state.db = knex({ client: "better-sqlite3", connection: { filename: ":memory:" }, useNullAsDefault: true });
	return { default: () => state.db };
});
vi.mock("../../lib/config.js", () => ({
	isSqlite: () => state.engine === "sqlite",
	isPostgres: () => state.engine === "postgres",
	getEncryptionKey: () => "0".repeat(64),
}));
vi.mock("../../internal/chat.js", () => ({ default: { sendHostMonitorAlert: vi.fn() } }));

import { pruneHistory } from "../../internal/proxy-host-monitor.js";
import { up } from "../../migrations/20260923000000_add_proxy_host_monitor.js";
import ProxyHostMonitorCheck from "../../models/proxy_host_monitor_check.js";

const NOW = Date.parse("2026-10-17T12:00:00.000Z");
const cutoff = new Date(NOW - 30 * 24 * 60 * 60 * 1000).toISOString();
const recent = new Date(NOW - 1000).toISOString();
const expired = new Date(Date.parse(cutoff) - 1).toISOString();
const historyRow = (hostId, checkedAt = recent) => ({ host_id: hostId, checked_at: checkedAt, state: "up" });
const historyIds = async (hostId) =>
	(await state.db("proxy_host_monitor_check").where("host_id", hostId).orderBy("id", "desc")).map(({ id }) => id);

describe.each(["sqlite", "postgres"])("monitor history retention in %s", (engine) => {
	let embedded;
	beforeAll(async () => {
		state.engine = engine;
		if (engine === "postgres") {
			embedded = await createPostgres();
			state.db = embedded.database;
			Model.knex(state.db);
		}
		await up(state.db);
	});
	beforeEach(async () => {
		await state.db("proxy_host_monitor_check").delete();
		vi.spyOn(Date, "now").mockReturnValue(NOW);
	});
	afterEach(() => vi.restoreAllMocks());
	afterAll(async () => {
		if (embedded) await embedded.close();
		else await state.db.destroy();
	});

	it("keeps the newest 100 unexpired IDs with one boundary lookup and one host-scoped deletion", async () => {
		for (let index = 0; index < 120; index++) {
			await state.db("proxy_host_monitor_check").insert(historyRow(11));
			if (index % 4 === 0) await state.db("proxy_host_monitor_check").insert(historyRow(11, expired));
		}
		await state.db("proxy_host_monitor_check").insert(historyRow(11, expired));
		await state.db("proxy_host_monitor_check").insert([historyRow(12), historyRow(12, expired)]);
		const expected = (
			await state
				.db("proxy_host_monitor_check")
				.where({ host_id: 11, checked_at: recent })
				.orderBy("id", "desc")
				.limit(100)
		).map(({ id }) => id);
		const otherHost = await historyIds(12);
		const statements = [];
		const collect = ({ sql }) => statements.push(sql);
		state.db.on("query", collect);
		try {
			await pruneHistory(11);
		} finally {
			state.db.off("query", collect);
		}
		expect(statements).toHaveLength(2);
		expect(statements[0]).toMatch(/select ["`]id["`].*limit.*offset/i);
		expect(statements[1]).toMatch(/^delete/i);
		expect(await historyIds(11)).toEqual(expected);
		expect(await historyIds(12)).toEqual(otherHost);
	});

	it("retains every fresh check below the count bound, including exactly the age cutoff", async () => {
		await state
			.db("proxy_host_monitor_check")
			.insert([
				historyRow(11, cutoff),
				historyRow(11),
				...Array.from({ length: 110 }, () => historyRow(11, expired)),
			]);
		await pruneHistory(11);
		const rows = await state.db("proxy_host_monitor_check").where("host_id", 11).orderBy("id");
		expect(rows.map(({ checked_at }) => checked_at)).toEqual([cutoff, recent]);
	});

	it("rolls back inserted checks and deletions together when their transaction fails", async () => {
		for (let index = 0; index < 101; index++) await state.db("proxy_host_monitor_check").insert(historyRow(11));
		const before = await historyIds(11);
		await expect(
			state.db.transaction(async (trx) => {
				await ProxyHostMonitorCheck.query(trx).insert(historyRow(11));
				await pruneHistory(11, trx);
				expect(await trx("proxy_host_monitor_check").where("host_id", 11)).toHaveLength(100);
				throw new Error("Reject transaction");
			}),
		).rejects.toThrow("Reject transaction");
		expect(await historyIds(11)).toEqual(before);
	});

	it.skipIf(engine !== "sqlite" || process.env.BENCHMARK_MONITOR_HISTORY !== "1")(
		"benchmarks identical persistence fixtures with 10, 100 and 1000 monitors",
		async () => {
			vi.restoreAllMocks();
			const measurements = [];
			const checkedAt = new Date().toISOString();
			for (const mode of ["baseline", "optimized"]) {
				await seedBenchmark(50, checkedAt);
				for (let hostId = 1; hostId <= 50; hostId++) await persistBenchmarkCheck(mode, 50, hostId, checkedAt);
			}
			for (const count of [10, 100, 1000]) {
				const samplesByMode = { baseline: [], optimized: [] };
				for (let repeat = 0; repeat < 3; repeat++) {
					for (const mode of repeat % 2 ? ["optimized", "baseline"] : ["baseline", "optimized"]) {
						await seedBenchmark(count, checkedAt);
						let queries = 0;
						const queryTimes = new Map();
						let sqlMs = 0;
						let boundaryIds = 0;
						const onQuery = ({ __knexQueryUid: id }) => {
							queries++;
							queryTimes.set(id, performance.now());
						};
						const onResponse = (response, { __knexQueryUid: id, sql }) => {
							if (queryTimes.has(id)) sqlMs += performance.now() - queryTimes.get(id);
							if (/^select\b/i.test(sql))
								boundaryIds += Array.isArray(response) ? response.length : Number(!!response);
						};
						state.db.on("query", onQuery);
						state.db.on("query-response", onResponse);
						const durations = [];
						const start = performance.now();
						try {
							for (let hostId = 1; hostId <= count; hostId++) {
								const checkStart = performance.now();
								await persistBenchmarkCheck(mode, count, hostId, checkedAt);
								durations.push(performance.now() - checkStart);
							}
						} finally {
							state.db.off("query", onQuery);
							state.db.off("query-response", onResponse);
						}
						const elapsedMs = performance.now() - start;
						durations.sort((a, b) => a - b);
						expect(boundaryIds).toBe(count * (mode === "baseline" ? 100 : 1));
						samplesByMode[mode].push({
							queries,
							boundaryIds,
							elapsedMs,
							sqlMs,
							p95Ms: durations[Math.ceil(count * 0.95) - 1],
						});
						const counts = await state
							.db("proxy_host_monitor_check")
							.groupBy("host_id")
							.count("id as count");
						expect(counts).toHaveLength(count);
						expect(counts.every((row) => Number(row.count) === 100)).toBe(true);
					}
				}
				for (const [mode, samples] of Object.entries(samplesByMode))
					measurements.push({ monitors: count, mode, samples });
			}
			console.log(`MONITOR_HISTORY_BENCHMARK=${JSON.stringify(measurements)}`);
		},
		120_000,
	);
});

async function persistBenchmarkCheck(mode, count, hostId, checkedAt) {
	await state.db.transaction(async (trx) => {
		await trx("proxy_host_monitor").where("host_id", hostId).update({ state: "up" });
		await ProxyHostMonitorCheck.query(trx).insert({
			id: count * 104 + hostId,
			...historyRow(hostId, checkedAt),
		});
		if (mode === "optimized") await pruneHistory(hostId, trx);
	});
	if (mode === "baseline") await baselinePrune(hostId);
}

/** Preserved pre-optimization cleanup for the opt-in comparison only. */
async function baselinePrune(hostId) {
	const olderThan = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
	await ProxyHostMonitorCheck.query().where("host_id", hostId).where("checked_at", "<", olderThan).delete();
	const newest = await ProxyHostMonitorCheck.query()
		.select("id")
		.where("host_id", hostId)
		.orderBy("id", "desc")
		.limit(100);
	if (newest.length === 100)
		await ProxyHostMonitorCheck.query().where("host_id", hostId).where("id", "<", newest.at(-1).id).delete();
}

async function seedBenchmark(count, checkedAt) {
	await state.db("proxy_host_monitor_check").delete();
	await state.db("proxy_host_monitor").delete();
	const old = new Date(Date.parse(checkedAt) - 31 * 24 * 60 * 60 * 1000).toISOString();
	for (let hostId = 1; hostId <= count; hostId++) {
		await state.db("proxy_host_monitor").insert({ host_id: hostId, created_on: checkedAt, modified_on: checkedAt });
		await state.db("proxy_host_monitor_check").insert(
			Array.from({ length: 104 }, (_, index) => ({
				id: (hostId - 1) * 104 + index + 1,
				...historyRow(hostId, index < 4 ? old : checkedAt),
			})),
		);
	}
}
