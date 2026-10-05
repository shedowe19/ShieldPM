import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ database: null }));
vi.mock("../../db.js", async () => {
	const { default: knex } = await import("knex");
	state.database = knex({ client: "better-sqlite3", connection: { filename: ":memory:" }, useNullAsDefault: true });
	return { default: () => state.database };
});
vi.mock("../../lib/config.js", () => ({ isSqlite: () => true, isPostgres: () => false }));

import auditLog from "../../internal/audit-log.js";
import auditLogModel from "../../models/audit-log.js";

const providerMetadata = () => ({
	id: 42,
	name: "Historical DDNS provider",
	provider: "custom",
	domains: ["ddns.example.test"],
	is_enabled: true,
	config: {
		token: "audit-test-placeholder",
		password: "audit-test-placeholder",
		url: "https://ddns.example.test/update?token=audit-test-placeholder",
	},
	meta: { last_result: "updated" },
});

const summaryMetadata = () => {
	const metadata = providerMetadata();
	delete metadata.config;
	return metadata;
};

const frozenMetadata = () => {
	const metadata = providerMetadata();
	Object.freeze(metadata.config);
	Object.freeze(metadata.domains);
	Object.freeze(metadata.meta);
	return Object.freeze(metadata);
};

const returnedQuery = (result, pageResult) => {
	const query = Object.assign(Promise.resolve(result), {
		allowGraph: vi.fn().mockReturnThis(),
		andWhere: vi.fn().mockReturnThis(),
		first: vi.fn().mockReturnThis(),
		limit: vi.fn().mockReturnThis(),
		orderBy: vi.fn().mockReturnThis(),
		page: vi.fn().mockResolvedValue(pageResult),
		withGraphFetched: vi.fn().mockReturnThis(),
	});
	return query;
};

describe("DDNS audit metadata privacy", () => {
	const access = { can: vi.fn().mockResolvedValue(true), token: { getUserId: vi.fn(() => 7) } };

	beforeAll(async () => {
		await state.database.schema.createTable("audit_log", (table) => {
			table.increments("id");
			table.string("created_on");
			table.string("modified_on");
			table.integer("user_id");
			table.integer("object_id");
			table.string("object_type");
			table.string("action");
			table.json("meta");
		});
	});

	beforeEach(async () => {
		vi.restoreAllMocks();
		vi.clearAllMocks();
		await state.database("audit_log").delete();
	});

	afterAll(async () => state.database.destroy());

	it.each(["created", "updated", "deleted"])(
		"stores a safe DDNS %s snapshot without mutating the caller or its provider configuration",
		async (action) => {
			const metadata = frozenMetadata();
			const data = Object.freeze({ action, object_type: "ddns-provider", object_id: 42, meta: metadata });

			const added = await auditLog.add(access, data);
			const stored = await state.database("audit_log").where({ id: added.id }).first();

			expect(added).toMatchObject({ action, object_type: "ddns-provider", object_id: 42, user_id: 7 });
			expect(added.meta).toEqual(summaryMetadata());
			expect(JSON.parse(stored.meta)).toEqual(summaryMetadata());
			expect(data).not.toHaveProperty("user_id");
			expect(data.meta).toBe(metadata);
			expect(metadata).toEqual(providerMetadata());
			expect(access.token.getUserId).toHaveBeenCalledWith(1);
		},
	);

	it.each(["setting", "wireguard-settings", "proxy-host"])(
		"preserves non-DDNS %s audit metadata",
		async (objectType) => {
			const metadata = frozenMetadata();
			const added = await auditLog.add(access, {
				action: "updated",
				object_type: objectType,
				object_id: 42,
				meta: metadata,
			});

			const single = await auditLog.get(access, { id: added.id });
			const rows = await auditLog.getAll(access);
			const page = await auditLog.getAll(access, undefined, undefined, {}, { page: 1, limit: 10 });

			for (const row of [added, single, rows[0], page.items[0]]) {
				expect(row.meta).toEqual(providerMetadata());
			}
			expect(metadata).toEqual(providerMetadata());
		},
	);

	it("redacts a historical SQLite row in single, legacy-list, and paginated reads without rewriting history", async () => {
		await state.database("audit_log").insert([
			{
				id: 101,
				created_on: "2026-10-04 08:00:00",
				modified_on: "2026-10-04 08:00:00",
				user_id: 7,
				object_id: 42,
				object_type: "ddns-provider",
				action: "updated",
				meta: JSON.stringify(providerMetadata()),
			},
			{
				id: 102,
				created_on: "2026-10-04 09:00:00",
				modified_on: "2026-10-04 09:00:00",
				user_id: 7,
				object_id: 42,
				object_type: "setting",
				action: "updated",
				meta: JSON.stringify(providerMetadata()),
			},
			{
				id: 103,
				created_on: "2026-10-04 10:00:00",
				modified_on: "2026-10-04 10:00:00",
				user_id: 7,
				object_id: 42,
				object_type: "ddns-provider",
				action: "updated",
				meta: JSON.stringify(providerMetadata()),
			},
		]);
		const databaseBefore = await state.database("audit_log").orderBy("id");

		const single = await auditLog.get(access, { id: 101 });
		const rows = await auditLog.getAll(access);
		const page = await auditLog.getAll(
			access,
			undefined,
			"Historical DDNS",
			{ action: "updated", object_type: "ddns-provider", user_id: 7, object_id: 42 },
			{ limit: 1, page: 2 },
		);

		expect(single).toBeInstanceOf(auditLogModel);
		expect(single.meta).toEqual(summaryMetadata());
		expect(rows.map((row) => row.id)).toEqual([103, 102, 101]);
		expect(rows[0].meta).toEqual(summaryMetadata());
		expect(rows[1].meta).toEqual(providerMetadata());
		expect(rows[2].meta).toEqual(summaryMetadata());
		expect(page.items.map((row) => row.id)).toEqual([101]);
		expect(page.items[0].meta).toEqual(summaryMetadata());
		expect(page.pagination).toEqual({ limit: 1, page: 2, totalItems: 2, totalPages: 2 });
		expect(await state.database("audit_log").orderBy("id")).toEqual(databaseBefore);
	});

	it("copies a DDNS model on single reads and preserves expanded user details", async () => {
		const metadata = frozenMetadata();
		const original = auditLogModel.fromJson({ id: 101, object_type: "ddns-provider", meta: metadata });
		original.user = { id: 7, name: "Audit test user" };
		const before = original.toJSON();
		const query = returnedQuery(original);
		vi.spyOn(auditLogModel, "query").mockReturnValueOnce(query);

		const result = await auditLog.get(access, { id: 101, expand: ["user"] });

		expect(result).not.toBe(original);
		expect(result).toBeInstanceOf(auditLogModel);
		expect(result.meta).toEqual(summaryMetadata());
		expect(result.user).toEqual(original.user);
		expect(original.toJSON()).toEqual(before);
		result.meta.domains.push("another.example.test");
		expect(original.toJSON()).toEqual(before);
		expect(query.andWhere).toHaveBeenCalledWith("id", 101);
		expect(query.withGraphFetched).toHaveBeenCalledWith("[user]");
	});

	it.each([false, true])("does not mutate source rows or page results when paginated=%s", async (paginated) => {
		const original = Object.freeze({ id: 101, object_type: "ddns-provider", meta: frozenMetadata() });
		const other = Object.freeze({ id: 102, object_type: "wireguard-settings", meta: frozenMetadata() });
		const sourceRows = Object.freeze([original, other]);
		const pageResult = Object.freeze({ results: sourceRows, total: 11 });
		const query = returnedQuery(sourceRows, pageResult);
		vi.spyOn(auditLogModel, "query").mockReturnValueOnce(query);

		const result = await auditLog.getAll(
			access,
			["user"],
			undefined,
			{},
			paginated ? { page: 2, limit: 2 } : undefined,
		);
		const rows = paginated ? result.items : result;

		expect(rows[0]).not.toBe(original);
		expect(rows[0].meta).toEqual(summaryMetadata());
		expect(rows[1]).toBe(other);
		expect(original.meta).toEqual(providerMetadata());
		expect(pageResult.results).toBe(sourceRows);
		expect(query.withGraphFetched).toHaveBeenCalledWith("[user]");
		if (paginated) {
			expect(result.pagination).toEqual({ page: 2, limit: 2, totalItems: 11, totalPages: 6 });
			expect(query.page).toHaveBeenCalledWith(1, 2);
		} else {
			expect(query.limit).toHaveBeenCalledWith(100);
		}
	});

	it.each(["single", "legacy-list", "paginated"])(
		"checks audit permissions before %s database reads",
		async (mode) => {
			const denied = new Error("Audit access denied");
			const restrictedAccess = { can: vi.fn().mockRejectedValue(denied) };
			const query = vi.spyOn(auditLogModel, "query");
			const read =
				mode === "single"
					? auditLog.get(restrictedAccess, { id: 101 })
					: auditLog.getAll(
							restrictedAccess,
							undefined,
							undefined,
							{},
							mode === "paginated" ? { page: 1, limit: 10 } : undefined,
						);

			await expect(read).rejects.toBe(denied);
			expect(restrictedAccess.can).toHaveBeenCalledWith("auditlog:list");
			expect(query).not.toHaveBeenCalled();
		},
	);

	it("preserves missing-event and missing-action errors", async () => {
		await expect(auditLog.get(access, { id: 999 })).rejects.toMatchObject({
			name: "ItemNotFoundError",
			status: 404,
		});
		const data = Object.freeze({ object_type: "ddns-provider", meta: frozenMetadata() });
		await expect(auditLog.add(access, data)).rejects.toMatchObject({
			name: "InternalValidationError",
			status: 400,
		});
		expect(await state.database("audit_log")).toEqual([]);
		expect(data).not.toHaveProperty("user_id");
	});
});
