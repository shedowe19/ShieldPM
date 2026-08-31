import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	analyticQuery: vi.fn(),
	analyticsKnex: vi.fn(),
}));

vi.mock("../../models/analytic_count.js", () => ({
	default: {
		query: mocks.analyticQuery,
		transaction: vi.fn(),
	},
}));
vi.mock("../../models/analytics_logs.js", () => ({
	default: {
		knex: mocks.analyticsKnex,
		tableName: "analytics_logs",
	},
}));
vi.mock("../../models/proxy_host.js", () => ({ default: {} }));

import { AnalyticsService } from "../../internal/analytics.js";

const createRecord = (sequence, overrides = {}) => {
	const event = {
		host_id: 7,
		time: `2026-08-31T20:0${sequence - 1}:10.000Z`,
		method: "GET",
		path: "/",
		status: 200,
		bytes: 10,
		ip: "192.0.2.1",
		country_code: "DE",
		referer: null,
		user_agent: "test",
		duration: 5,
		...overrides,
	};
	return { sequence, event, serialized: Buffer.from(`${JSON.stringify({ sequence, event })}\n`) };
};

const createSpool = (records = []) => ({
	close: vi.fn(),
	compact: vi.fn().mockReturnValue(true),
	getReplayFloor: vi.fn().mockReturnValue((records.at(-1)?.sequence || 0) + 1),
	markCommitted: vi.fn(),
	open: vi.fn(),
	peek: vi.fn().mockImplementation((limit) => records.slice(0, limit)),
	pendingCount: records.length,
});

describe("analytics durable ingestion", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("uses one stable batch id and ledger row to survive an ambiguous commit acknowledgement", async () => {
		const records = [createRecord(1), createRecord(2, { status: 503 })];
		const spool = createSpool(records);
		const service = new AnalyticsService("/tmp/unused", {
			spool,
			now: () => new Date("2026-08-31T20:10:00.000Z"),
		});
		const batch = service.buildBatch(records);
		const ledger = new Map();
		const detailedWrites = [];
		const aggregationWrites = [];

		const trx = (table) => {
			const state = { filters: {} };
			return {
				where(columnOrObject, value) {
					if (typeof columnOrObject === "object") Object.assign(state.filters, columnOrObject);
					else state.filters[columnOrObject] = value;
					return this;
				},
				first: async () => ledger.get(state.filters.batch_id),
				insert: async (row) => {
					if (table === "analytics_ingestion_batch") ledger.set(row.batch_id, { ...row });
				},
				update: async (changes) => {
					const row = ledger.get(state.filters.batch_id);
					if (!row || row.claim_token !== state.filters.claim_token || row.status !== state.filters.status)
						return 0;
					Object.assign(row, changes);
					return 1;
				},
			};
		};
		trx.table = () => ({ insert: async (rows) => detailedWrites.push(...rows) });
		trx.raw = vi.fn((sql, bindings) => ({ sql, bindings }));

		mocks.analyticQuery.mockImplementation(() => ({
			insert: (row) => {
				aggregationWrites.push(row);
				return {
					onConflict: () => ({ merge: async () => undefined }),
				};
			},
		}));

		let firstAttempt = true;
		const knex = {
			transaction: async (callback) => {
				const result = await callback(trx);
				if (firstAttempt) {
					firstAttempt = false;
					throw new Error("connection lost after commit");
				}
				return result;
			},
		};
		mocks.analyticsKnex.mockReturnValue(knex);

		await expect(service.commitBatch(batch)).rejects.toThrow(/connection lost/);
		expect(ledger.get(batch.batchId)).toEqual(
			expect.objectContaining({
				batch_id: batch.batchId,
				payload_hash: batch.payloadHash,
				record_count: 2,
				first_sequence: 1,
				last_sequence: 2,
				status: "committed",
			}),
		);
		expect(detailedWrites).toHaveLength(2);
		expect(aggregationWrites).toHaveLength(2);

		await expect(service.commitBatch(service.buildBatch(records))).resolves.toBe(false);
		expect(detailedWrites).toHaveLength(2);
		expect(aggregationWrites).toHaveLength(2);
	});

	it("serializes concurrent flush attempts and checkpoints only after the database commit", async () => {
		const records = [createRecord(1)];
		const spool = createSpool(records);
		spool.compact.mockReturnValue(false);
		const service = new AnalyticsService("/tmp/unused", { spool });
		let release;
		const committed = new Promise((resolve) => {
			release = resolve;
		});
		service.commitBatch = vi.fn().mockReturnValue(committed);

		const first = service.flush();
		const second = service.flush();
		expect(service.commitBatch).toHaveBeenCalledOnce();
		expect(spool.markCommitted).not.toHaveBeenCalled();
		release(true);
		await Promise.all([first, second]);
		expect(spool.markCommitted).toHaveBeenCalledOnce();
		expect(spool.markCommitted).toHaveBeenCalledWith(1);
	});

	it("deletes ledger rows only below the first sequence still replayable from the compacted spool", async () => {
		const spool = createSpool([createRecord(11)]);
		spool.getReplayFloor.mockReturnValue(11);
		const service = new AnalyticsService("/tmp/unused", { spool });
		const remove = vi.fn().mockResolvedValue(3);
		const andWhere = vi.fn().mockReturnValue({ delete: remove });
		const database = vi.fn().mockReturnValue({
			where: vi.fn().mockReturnValue({ andWhere }),
		});
		mocks.analyticsKnex.mockReturnValue(database);

		await expect(service.cleanupLedger()).resolves.toBe(3);
		expect(database).toHaveBeenCalledWith("analytics_ingestion_batch");
		expect(andWhere).toHaveBeenCalledWith("last_sequence", "<", 11);
		expect(remove).toHaveBeenCalledOnce();
	});

	it("drains every pending batch before closing the spool on shutdown", async () => {
		let pending = 2;
		const spool = createSpool();
		Object.defineProperty(spool, "pendingCount", { get: () => pending });
		spool.compact.mockReturnValue(false);
		const service = new AnalyticsService("/tmp/unused", { spool });
		service.flush = vi.fn().mockImplementation(async () => {
			pending--;
		});

		await service.stop();
		expect(service.flush).toHaveBeenCalledTimes(2);
		expect(spool.close).toHaveBeenCalledOnce();
	});
});
