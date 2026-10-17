import dayjs from "dayjs";
import { Model } from "objection";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPostgres } from "../helpers/postgres.js";

const state = vi.hoisted(() => ({ db: null }));
vi.mock("../../db.js", async () => {
	const { default: knex } = await import("knex");
	state.db = knex({ client: "better-sqlite3", connection: { filename: ":memory:" }, useNullAsDefault: true });
	return { default: () => state.db };
});
vi.mock("../../models/token.js", () => ({ default: () => ({ create: async () => ({ token: "signed-access" }) }) }));

import cleanup from "../../internal/auth-session-cleanup.js";
import pairs from "../../internal/auth-session-service.js";
import { up } from "../../migrations/20260316122700_add_auth_sessions.js";
import User from "../../models/user.js";

describe.each(["sqlite", "postgres"])("bounded refresh-session retention on %s", (engine) => {
	let embedded;
	beforeAll(async () => {
		if (engine === "postgres") {
			embedded = await createPostgres();
			state.db = embedded.database;
			Model.knex(state.db);
		}
		await state.db.schema.createTable("user", (table) => {
			table.increments("id");
			table.string("email");
			table.json("roles");
			table.integer("is_deleted").defaultTo(0);
			table.integer("is_disabled").defaultTo(0);
		});
		await state.db("user").insert({ id: 7, email: "owner@example.test", roles: "[]" });
		await up(state.db);
	});
	beforeEach(async () => {
		await cleanup.stop();
		await state.db("auth_sessions").delete();
	});
	afterAll(async () => {
		await cleanup.stop();
		if (embedded) await embedded.close();
		else await state.db.destroy();
	});

	it("removes old expired rows in bounded batches while retaining unexpired replay predecessors", async () => {
		const user = await User.query().findById(7);
		const first = await pairs.issueTokenPair(user);
		const current = await pairs.refreshTokenPair(first.refresh_token);
		const cutoffOld = dayjs().subtract(8, "day").format("YYYY-MM-DD HH:mm:ss");
		for (let index = 0; index < 5; index++) {
			const old = await pairs.issueTokenPair(user);
			await state.db("auth_sessions").where("id", old.session.id).update({ expires_at: cutoffOld });
		}
		const recentlyExpired = await pairs.issueTokenPair(user);
		await state
			.db("auth_sessions")
			.where("id", recentlyExpired.session.id)
			.update({ expires_at: dayjs().subtract(1, "day").format("YYYY-MM-DD HH:mm:ss") });
		expect(await cleanup.prune({ batchSize: 2, maxBatches: 2 })).toBe(4);
		expect(await cleanup.prune()).toBe(1);
		expect(await state.db("auth_sessions")).toHaveLength(3);
		await expect(pairs.refreshTokenPair(first.refresh_token)).rejects.toThrow("replay detected");
		await expect(pairs.refreshTokenPair(current.refresh_token)).rejects.toThrow("revoked");
	});

	it("can remove an expired ancestor without deleting a current descendant", async () => {
		const first = await pairs.issueTokenPair(await User.query().findById(7));
		const successor = await pairs.refreshTokenPair(first.refresh_token);
		await state
			.db("auth_sessions")
			.where("id", first.session.id)
			.update({ expires_at: dayjs().subtract(8, "day").format("YYYY-MM-DD HH:mm:ss") });
		expect(await cleanup.prune()).toBe(1);
		expect(
			(await state.db("auth_sessions").where("id", successor.session.id).first()).parent_session_id,
		).toBeNull();
		await expect(pairs.refreshTokenPair(successor.refresh_token)).resolves.toHaveProperty("access_token");
	});
});
