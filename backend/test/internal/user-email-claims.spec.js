import bcrypt from "bcryptjs";
import { Model } from "objection";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPostgres } from "../helpers/postgres.js";

const state = vi.hoisted(() => ({ db: null, engine: "sqlite", createToken: vi.fn(async () => ({ token: "signed" })) }));
vi.mock("../../db.js", async () => {
	const { default: knex } = await import("knex");
	state.db = knex({ client: "better-sqlite3", connection: { filename: ":memory:" }, useNullAsDefault: true });
	return { default: () => state.db };
});
vi.mock("../../lib/config.js", () => ({ isSqlite: () => state.engine === "sqlite" }));
vi.mock("../../models/token.js", () => ({ default: () => ({ create: state.createToken }) }));
vi.mock("../../internal/audit-log.js", () => ({ default: { add: vi.fn() } }));
vi.mock("../../lib/utils.js", () => ({ default: {} }));

import tokens from "../../internal/token.js";
import users from "../../internal/user.js";

const access = { can: async () => {}, token: { getUserId: () => 99 } };
const newAccount = (email) => ({ email, name: "New user", nickname: "new", roles: [] });
const activeEmailRows = () =>
	state.db("user").where("is_deleted", 0).whereRaw("LOWER(TRIM(??)) = ?", ["email", "shared@example.test"]);

// Hold only completed checks outside a transaction to reproduce the old race.
// Checks inside the claim transaction run normally, so its serialization is
// exercised by the real database rather than replaced by a JavaScript lock.
const raceUnprotectedChecks = () => {
	const available = users.isEmailAvailable;
	const gate = Promise.withResolvers();
	let checked = 0;
	vi.spyOn(users, "isEmailAvailable").mockImplementation(async (email, id, trx) => {
		const result = await available(email, id, trx);
		if (!trx) {
			if (++checked === 2) gate.resolve();
			await gate.promise;
		}
		return result;
	});
};

describe.each(["sqlite", "postgres"])("normalized account email claims in %s", (engine) => {
	let embedded;
	let passwordHash;
	beforeAll(async () => {
		state.engine = engine;
		if (engine === "postgres") {
			embedded = await createPostgres();
			state.db = embedded.database;
			Model.knex(state.db);
		}
		passwordHash = await bcrypt.hash("test-password", 4);
		await state.db.schema.createTable("user", (table) => {
			table.increments("id");
			for (const field of [
				"email",
				"name",
				"nickname",
				"avatar",
				"avatar_type",
				"avatar_value",
				"roles",
				"created_on",
				"modified_on",
			])
				table.text(field);
			table.integer("is_deleted").defaultTo(0);
			table.integer("is_disabled").defaultTo(0);
		});
		await state.db.schema.createTable("setting", (table) => {
			table.string("id").primary();
			table.text("value");
			table.text("meta");
		});
		await state.db.schema.createTable("auth", (table) => {
			table.increments("id");
			table.integer("user_id");
			for (const field of ["type", "secret", "meta", "created_on", "modified_on"]) table.text(field);
			table.integer("is_deleted").defaultTo(0);
		});
		await state.db.schema.createTable("user_permission", (table) => {
			table.increments("id");
			table.integer("user_id");
			for (const field of [
				"visibility",
				"access_lists",
				"certificates",
				"proxy_hosts",
				"redirection_hosts",
				"streams",
				"dead_hosts",
				"cloudflared_tunnels",
				"analytics",
				"created_on",
				"modified_on",
			])
				table.text(field);
		});
	});
	beforeEach(async () => {
		vi.clearAllMocks();
		for (const table of ["auth", "user_permission", "user", "setting"]) await state.db(table).delete();
		await state.db("setting").insert({ id: "default-site", value: "404", meta: "{}" });
		await state.db("user").insert([
			{ id: 7, email: "first@example.test", name: "First", nickname: "first", roles: "[]", avatar: "" },
			{ id: 8, email: "second@example.test", name: "Second", nickname: "second", roles: "[]", avatar: "" },
		]);
		if (engine === "postgres") {
			// Explicit fixture IDs do not advance PostgreSQL's generated-ID sequence.
			await state.db.raw(
				"SELECT setval(pg_get_serial_sequence('\"user\"', 'id'), (SELECT MAX(id) FROM \"user\"), true)",
			);
		}
		await state.db("auth").insert({ user_id: 7, type: "password", secret: passwordHash, meta: "{}" });
	});
	afterEach(() => vi.restoreAllMocks());
	afterAll(async () => {
		if (embedded) await embedded.close();
		else await state.db.destroy();
	});

	it("checks legacy case and surrounding spaces, excludes self, and keeps disabled emails reserved", async () => {
		await state.db("user").where({ id: 7 }).update({ email: " Mixed@Example.Test ", is_disabled: 1 });
		expect(await users.isEmailAvailable("mixed@example.test")).toBe(false);
		expect(await users.isEmailAvailable(" MIXED@EXAMPLE.TEST ", 7)).toBe(true);
		await expect(users.create(access, newAccount("mixed@example.test"))).rejects.toThrow(
			"Email address already in use",
		);
		await expect(users.update(access, { id: 8, email: " MIXED@Example.Test " })).rejects.toThrow(
			"Email address already in use",
		);
		expect((await state.db("user").where({ id: 8 }).first()).email).toBe("second@example.test");
	});

	it("normalizes a free address on create and update, including a self-address form submission", async () => {
		const created = await users.create(access, newAccount(" NEW@Example.Test "));
		expect(created.email).toBe("new@example.test");
		await users.update(access, { id: 7, email: " FREE@Example.Test " });
		await users.update(access, { id: 7, email: " FREE@example.test " });
		expect((await state.db("user").where({ id: 7 }).first()).email).toBe("free@example.test");
	});

	// Fixed normalized-email vector from https://docs.gravatar.com/rest/hash/.
	const gravatarVector =
		"https://www.gravatar.com/avatar/84059b07d4be67b806386c0aad8070a23f18836bbaae342275dc0a83414c32ee?d=mm";
	it("persists the official SHA-256 Gravatar vector when creating an account", async () => {
		const created = await users.create(access, newAccount(" MyEmailAddress@example.com "));
		expect(created).toMatchObject({ email: "myemailaddress@example.com", avatar: gravatarVector });
		expect(await state.db("user").where({ id: created.id }).first()).toMatchObject({
			email: "myemailaddress@example.com",
			avatar: gravatarVector,
		});
	});

	it("replaces a stored legacy Gravatar URL with the official SHA-256 vector on profile update", async () => {
		await state.db("user").where({ id: 7 }).update({
			avatar_type: "gravatar",
			avatar: "https://www.gravatar.com/avatar/6193176330f8d38747f038c170ddb193?d=mm",
		});
		const updated = await users.update(access, { id: 7, email: " MyEmailAddress@example.com " });
		expect(updated).toMatchObject({ email: "myemailaddress@example.com", avatar: gravatarVector });
		expect(await state.db("user").where({ id: 7 }).first()).toMatchObject({
			email: "myemailaddress@example.com",
			avatar: gravatarVector,
		});
	});

	it.each(["create", "update"])("permits reuse after soft deletion via %s", async (operation) => {
		await state.db("user").where({ id: 7 }).update({ email: " Reusable@Example.Test ", is_deleted: 1 });
		if (operation === "create") await users.create(access, newAccount("REUSABLE@example.test"));
		else await users.update(access, { id: 8, email: "REUSABLE@example.test" });
		const rows = await state.db("user").whereRaw("LOWER(TRIM(??)) = ?", ["email", "reusable@example.test"]);
		expect(rows).toHaveLength(2);
		expect(rows.filter((row) => row.is_deleted === 0)).toHaveLength(1);
	});

	it.each(["create", "update", "create-versus-update"])(
		"allows only one simultaneous %s claim",
		async (operation) => {
			raceUnprotectedChecks();
			const create = () => users.create(access, newAccount(" SHARED@Example.Test "));
			const update = (id) => users.update(access, { id, email: "shared@example.test" });
			const requests =
				operation === "create"
					? [create(), create()]
					: operation === "update"
						? [update(7), update(8)]
						: [create(), update(8)];
			const results = await Promise.allSettled(requests);
			expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
			expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
			expect(await activeEmailRows()).toHaveLength(1);
		},
	);

	it.each(["create", "update"])("locks, checks and writes one transaction for %s", async (operation) => {
		const queries = [];
		const record = (query) => queries.push(query);
		state.db.on("query", record);
		try {
			if (operation === "create") await users.create(access, newAccount("new@example.test"));
			else await users.update(access, { id: 7, email: "new@example.test" });
		} finally {
			state.db.removeListener("query", record);
		}
		const lock = queries.find(
			(query) => query.sql.includes('from "setting"') || query.sql.includes("from `setting`"),
		);
		const check = queries.find((query) => query.sql.includes("LOWER(TRIM("));
		const write = queries.find((query) => /^(insert into|update) ["`]user["`]/i.test(query.sql));
		expect(lock.__knexTxId).toBeTruthy();
		expect(check.__knexTxId).toBe(lock.__knexTxId);
		expect(write.__knexTxId).toBe(lock.__knexTxId);
		expect(queries.indexOf(lock)).toBeLessThan(queries.indexOf(check));
		expect(queries.indexOf(check)).toBeLessThan(queries.indexOf(write));
		if (engine === "postgres") {
			expect(lock.sql).toMatch(/for update$/i);
			const begin = queries.find((query) => /^BEGIN TRANSACTION/i.test(query.sql));
			expect(begin.sql).toMatch(/^BEGIN TRANSACTION ISOLATION LEVEL read committed;$/i);
			expect(queries.indexOf(begin)).toBeLessThan(queries.indexOf(lock));
		}
	});

	it.runIf(engine === "postgres").each(["create", "update"])(
		"overrides a PostgreSQL REPEATABLE READ server default for an email %s claim",
		async (operation) => {
			const previous = await state.db.raw("SHOW default_transaction_isolation");
			await state.db.raw("SELECT set_config('default_transaction_isolation', ?, false)", ["repeatable read"]);
			const available = users.isEmailAvailable;
			vi.spyOn(users, "isEmailAvailable").mockImplementation(async (email, id, trx) => {
				const isolation = await trx.raw("SHOW transaction_isolation");
				expect(isolation.rows[0].transaction_isolation).toBe("read committed");
				return available(email, id, trx);
			});
			try {
				if (operation === "create") await users.create(access, newAccount("new@example.test"));
				else await users.update(access, { id: 7, email: "new@example.test" });
			} finally {
				await state.db.raw("SELECT set_config('default_transaction_isolation', ?, false)", [
					previous.rows[0].default_transaction_isolation,
				]);
			}
			expect(users.isEmailAvailable).toHaveBeenCalledOnce();
		},
	);

	it.each(["create", "update"])("rejects %s email claims when the singleton is missing", async (operation) => {
		await state.db("setting").delete();
		const request =
			operation === "create"
				? users.create(access, newAccount("new@example.test"))
				: users.update(access, { id: 7, email: "new@example.test" });
		await expect(request).rejects.toMatchObject({ status: 403 });
		expect(await state.db("user")).toHaveLength(2);
		expect((await state.db("user").where({ id: 7 }).first()).email).toBe("first@example.test");
	});

	it("keeps profile-only changes independent of the email claim singleton", async () => {
		await state.db("setting").delete();
		await users.update(access, { id: 7, name: "Changed profile" });
		expect((await state.db("user").where({ id: 7 }).first()).name).toBe("Changed profile");
	});

	it("authenticates the sole legacy normalized match with password and OIDC", async () => {
		await state.db("user").where({ id: 7 }).update({ email: " First@Example.Test " });
		await expect(
			tokens.getTokenFromEmail({ identity: " FIRST@example.test ", secret: "test-password" }),
		).resolves.toMatchObject({ token: "signed", user: { id: 7 } });
		await expect(tokens.getTokenFromOAuthClaim({ identity: " FIRST@example.test " })).resolves.toMatchObject({
			token: "signed",
		});
		expect(state.createToken).toHaveBeenLastCalledWith(
			expect.objectContaining({ attrs: { id: 7 }, expiresIn: "5m" }),
		);
	});

	it.each([0, 1])(
		"rejects ambiguous legacy matches even when the second account is disabled=%s",
		async (disabled) => {
			await state.db("user").where({ id: 7 }).update({ email: "shared@example.test" });
			await state.db("user").where({ id: 8 }).update({ email: " Shared@Example.Test ", is_disabled: disabled });
			const compare = vi.spyOn(bcrypt, "compare");
			await expect(
				tokens.getTokenFromEmail({ identity: " SHARED@example.test ", secret: "test-password" }),
			).rejects.toMatchObject({ name: "AuthError", message: "Invalid email or password", status: 400 });
			expect(compare).toHaveBeenCalledOnce();
			expect(bcrypt.getRounds(compare.mock.calls[0][1])).toBe(13);
			await expect(tokens.getTokenFromOAuthClaim({ identity: "shared@example.test" })).rejects.toMatchObject({
				message: "Invalid email or password",
				status: 400,
			});
			expect(state.createToken).not.toHaveBeenCalled();
			await expect(users.update(access, { id: 7, email: "shared@example.test" })).rejects.toThrow(
				"Email address already in use",
			);
		},
	);

	it("ignores deleted historical matches but denies a disabled sole match", async () => {
		await state.db("user").where({ id: 8 }).update({ email: " First@Example.Test ", is_deleted: 1 });
		await expect(tokens.getTokenFromOAuthClaim({ identity: "first@example.test" })).resolves.toMatchObject({
			token: "signed",
		});
		await state.db("user").where({ id: 7 }).update({ is_disabled: 1 });
		await expect(
			tokens.getTokenFromEmail({ identity: "first@example.test", secret: "test-password" }),
		).rejects.toMatchObject({ name: "AuthError", status: 400 });
		await expect(tokens.getTokenFromOAuthClaim({ identity: "first@example.test" })).rejects.toMatchObject({
			status: 400,
		});
		expect(state.createToken).toHaveBeenCalledTimes(1);
	});
});
