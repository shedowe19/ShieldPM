import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import bcrypt from "bcryptjs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null, createToken: vi.fn(async () => ({ token: "signed" })) }));
vi.mock("../../db.js", async () => {
	const { default: knex } = await import("knex");
	state.db = knex({ client: "better-sqlite3", connection: { filename: ":memory:" }, useNullAsDefault: true });
	return { default: () => state.db };
});
vi.mock("../../lib/config.js", () => ({ isSqlite: () => true }));
vi.mock("../../models/token.js", () => ({ default: () => ({ create: state.createToken }) }));
vi.mock("../../internal/audit-log.js", () => ({ default: { add: vi.fn() } }));
vi.mock("../../lib/utils.js", () => ({ default: {} }));

import tokens from "../../internal/token.js";
import service from "../../internal/user.js";

const access = { can: vi.fn(), token: { getUserId: () => 99 } };
const account = { id: 7, name: "Owner", email: "owner@example.test", roles: [] };

describe("account database and filesystem transactions", () => {
	let avatarDirectory;
	beforeAll(async () => {
		await state.db.schema.createTable("user", (t) => {
			t.increments("id");
			t.string("email");
			t.string("name");
			t.text("roles");
			t.integer("is_deleted").defaultTo(0);
			t.integer("is_disabled").defaultTo(0);
			t.string("avatar_type");
			t.string("avatar_value");
			t.string("avatar");
			t.string("modified_on");
		});
		await state.db.schema.createTable("auth", (t) => {
			t.increments("id");
			t.integer("user_id");
			t.string("type");
			t.string("secret");
			t.text("meta");
			t.integer("is_deleted").defaultTo(0);
			t.string("created_on");
			t.string("modified_on");
		});
		await state.db.schema.createTable("user_permission", (t) => {
			t.increments("id");
			t.integer("user_id").unique();
			t.string("visibility");
			t.string("proxy_hosts");
			t.string("created_on");
			t.string("modified_on");
		});
		await state.db.schema.createTable("auth_sessions", (t) => {
			t.increments("id");
			t.integer("user_id");
			t.string("revoked_at");
			t.string("revoked_reason");
		});
	});
	beforeEach(async () => {
		vi.clearAllMocks();
		for (const table of ["auth", "user_permission", "auth_sessions", "user"]) await state.db(table).delete();
		await state.db("user").insert({ ...account, roles: "[]" });
		await state.db("auth").insert([
			{ id: 1, user_id: 7, type: "password", secret: "deleted", is_deleted: 1 },
			{ id: 2, user_id: 7, type: "password", secret: await bcrypt.hash("old-password", 4), is_deleted: 0 },
			{ id: 3, user_id: 7, type: "oidc", secret: "oidc", is_deleted: 0 },
		]);
		await state.db("auth_sessions").insert([
			{ id: 1, user_id: 7, revoked_at: null, revoked_reason: null },
			{ id: 2, user_id: 7, revoked_at: "earlier", revoked_reason: "logout" },
			{ id: 3, user_id: 8, revoked_at: null, revoked_reason: null },
		]);
		vi.spyOn(service, "get").mockResolvedValue({ ...account });
	});
	afterEach(async () => {
		await state.db.raw("DROP TRIGGER IF EXISTS reject_revocation");
		await state.db.raw("DROP TRIGGER IF EXISTS reject_avatar");
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
		if (avatarDirectory) fs.rmSync(avatarDirectory, { recursive: true, force: true });
		avatarDirectory = null;
	});
	afterAll(async () => state.db.destroy());

	it("rejects unsupported local-auth creation before persisting an account", async () => {
		await expect(
			service.create(access, { email: "new@example.test", auth: { type: "local", secret: "must-not-persist" } }),
		).rejects.toThrow("Only password authentication");
		expect(await state.db("user")).toHaveLength(1);
	});

	it("limits the encrypted OIDC handoff JWT to the five-minute cookie lifetime", async () => {
		await tokens.getTokenFromOAuthClaim({ identity: account.email });
		expect(state.createToken).toHaveBeenCalledWith(expect.objectContaining({ expiresIn: "5m" }));
	});

	it("updates permissions without replacing the row ID or target owner", async () => {
		await state.db("user_permission").insert([
			{ id: 20, user_id: 7, visibility: "user", proxy_hosts: "hidden" },
			{ id: 7, user_id: 8, visibility: "all", proxy_hosts: "view" },
		]);
		await service.setPermissions(access, { id: 7, user_id: 8, visibility: "all", proxy_hosts: "manage" });
		expect(await state.db("user_permission").where({ id: 20 }).first()).toMatchObject({
			user_id: 7,
			proxy_hosts: "manage",
		});
		expect(await state.db("user_permission").where({ id: 7 }).first()).toMatchObject({
			user_id: 8,
			proxy_hosts: "view",
		});
	});

	it("does not undo concurrent account restrictions with unchanged profile-form flags", async () => {
		service.get.mockImplementationOnce(async () => {
			// The request read the old account before an administrator removed its
			// role and blocked it. Its stale form must not restore either flag.
			await state.db("user").where({ id: 7 }).update({ roles: "[]", is_disabled: 1 });
			return { ...account, roles: ["admin"], is_disabled: false };
		});
		const profileAccess = {
			token: { getUserId: () => 7 },
			can: vi.fn(async (permission) => {
				if (permission === "users:permissions") throw new Error("Not an administrator");
			}),
		};
		await service.update(profileAccess, { id: 7, name: "Updated profile", roles: ["admin"], is_disabled: false });
		expect(await state.db("user").where({ id: 7 }).first()).toMatchObject({
			name: "Updated profile",
			roles: "[]",
			is_disabled: 1,
		});
	});

	it("inserts missing permissions using the database row sequence", async () => {
		await state.db("user_permission").insert({ id: 7, user_id: 8, visibility: "all" });
		await service.setPermissions(access, { id: 7, user_id: 8, visibility: "user" });
		const row = await state.db("user_permission").where({ user_id: 7 }).first();
		expect(row.id).not.toBe(7);
	});

	it("changes only active password credentials and revokes the user's live refresh sessions", async () => {
		await service.setPassword(access, { id: 7, type: "password", secret: "new-password" });
		const auth = await state.db("auth").orderBy("id");
		expect(auth[0].secret).toBe("deleted");
		expect(await bcrypt.compare("new-password", auth[1].secret)).toBe(true);
		expect(auth[2].secret).toBe("oidc");
		expect(await state.db("auth_sessions").where({ id: 1 }).first()).toMatchObject({
			revoked_reason: "password_changed",
			revoked_at: expect.any(String),
		});
		expect(await state.db("auth_sessions").where({ id: 2 }).first()).toMatchObject({
			revoked_reason: "logout",
			revoked_at: "earlier",
		});
		expect(await state.db("auth_sessions").where({ id: 3 }).first()).toMatchObject({ revoked_at: null });
	});

	it("rolls back the password if revoking refresh sessions fails", async () => {
		const before = await state.db("auth").where({ id: 2 }).first();
		await state.db.raw(
			"CREATE TRIGGER reject_revocation BEFORE UPDATE ON auth_sessions BEGIN SELECT RAISE(ABORT, 'revocation failed'); END",
		);
		await expect(service.setPassword(access, { id: 7, type: "password", secret: "new-password" })).rejects.toThrow(
			"revocation failed",
		);
		expect((await state.db("auth").where({ id: 2 }).first()).secret).toBe(before.secret);
	});

	it("does not authenticate a deleted password before a live credential", async () => {
		await expect(
			tokens.getTokenFromEmail({ identity: account.email, secret: "old-password" }),
		).resolves.toMatchObject({ token: "signed" });
		await state.db("auth").where({ id: 2 }).update({ is_deleted: 1 });
		await expect(tokens.getTokenFromEmail({ identity: account.email, secret: "old-password" })).rejects.toThrow(
			"Invalid email or password",
		);
		expect(state.createToken).toHaveBeenCalledTimes(1);
	});

	it.each([false, true])(
		"preserves the previous avatar until the replacement commits (DB failure=%s)",
		async (fails) => {
			avatarDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "shieldpm-avatar-"));
			vi.stubEnv("DATA_PATH", avatarDirectory);
			const directory = path.join(avatarDirectory, "avatars");
			fs.mkdirSync(directory);
			fs.writeFileSync(path.join(directory, "7-old.png"), "old-image");
			service.get.mockResolvedValue({ ...account, avatar_type: "upload", avatar_value: "7-old.png" });
			await state.db("user").where({ id: 7 }).update({ avatar_type: "upload", avatar_value: "7-old.png" });
			if (fails)
				await state.db.raw(
					"CREATE TRIGGER reject_avatar BEFORE UPDATE ON user BEGIN SELECT RAISE(ABORT, 'avatar failed'); END",
				);
			const result = service.uploadAvatar(access, {
				id: 7,
				file: { size: 8, data: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]) },
			});
			if (fails) {
				await expect(result).rejects.toThrow("avatar failed");
				expect(fs.readdirSync(directory)).toEqual(["7-old.png"]);
				expect(fs.readFileSync(path.join(directory, "7-old.png"), "utf8")).toBe("old-image");
			} else {
				await result;
				const row = await state.db("user").where({ id: 7 }).first();
				expect(fs.readdirSync(directory)).toEqual([row.avatar_value]);
				expect(row.avatar_value).not.toBe("7-old.png");
			}
		},
	);
});
