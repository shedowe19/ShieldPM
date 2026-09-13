import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null }));
vi.mock("../../db.js", async () => {
	const { default: knex } = await import("knex");
	state.db = knex({ client: "better-sqlite3", connection: { filename: ":memory:" }, useNullAsDefault: true });
	return { default: () => state.db };
});
vi.mock("../../lib/config.js", () => ({ isSqlite: () => true, getEncryptionKey: () => "01".repeat(32) }));
vi.mock("../../models/token.js", () => ({ default: () => ({ create: async () => ({ token: "access-token" }) }) }));
vi.mock("../../internal/2fa-service.js", () => ({ default: {} }));
vi.mock("../../lib/express/jwt-decode.js", () => ({ default: () => (_req, _res, next) => next() }));
vi.mock("../../lib/validator/api.js", () => ({ default: vi.fn() }));
vi.mock("../../schema/index.js", () => ({ getValidationSchema: vi.fn() }));

import sessions from "../../internal/auth-session-service.js";
import router from "../../routes/tokens.js";

const user = { id: 7, email: "owner@example.test", roles: [] };
const response = () => ({ clearCookie: vi.fn(), sendStatus: vi.fn() });
const logout = (path, method) =>
	router.stack
		.find((layer) => layer.route?.path === path)
		.route.stack.filter((layer) => layer.method === method)
		.at(-1).handle;

describe("logout revokes rotated refresh-token descendants", () => {
	beforeAll(async () => {
		await state.db.schema.createTable("user", (table) => {
			table.increments("id");
			table.string("email");
			table.text("roles");
			table.integer("is_deleted").defaultTo(0);
			table.integer("is_disabled").defaultTo(0);
		});
		await state.db.schema.createTable("auth_sessions", (table) => {
			table.increments("id");
			table.integer("user_id");
			table.integer("parent_session_id");
			table.integer("replaced_by_session_id");
			for (const field of [
				"family_id",
				"token_hash",
				"jti",
				"expires_at",
				"last_used_at",
				"rotated_at",
				"revoked_at",
				"revoked_reason",
				"created_ip",
				"created_user_agent",
			])
				table.string(field);
			table.text("scope");
		});
		await state.db("user").insert({ ...user, roles: "[]" });
	});
	beforeEach(async () => state.db("auth_sessions").delete());
	afterAll(async () => state.db.destroy());

	it.each([
		["/logout", "post"],
		["/", "delete"],
	])("%s (%s) revokes the successor while preserving an independent device login", async (path, method) => {
		const first = await sessions.issueTokenPair(user);
		const otherDevice = await sessions.issueTokenPair(user);
		const successor = await sessions.refreshTokenPair(first.refresh_token);
		const res = response();
		await logout(path, method)({ cookies: { shieldpm_refresh: first.refresh_token } }, res);
		expect(res.sendStatus).toHaveBeenCalledWith(204);
		await expect(sessions.refreshTokenPair(successor.refresh_token)).rejects.toThrow("revoked");
		await expect(sessions.refreshTokenPair(otherDevice.refresh_token)).resolves.toHaveProperty("access_token");
	});

	it("also revokes successors when the supplied ancestor was already revoked", async () => {
		const first = await sessions.issueTokenPair(user);
		const successor = await sessions.refreshTokenPair(first.refresh_token);
		await sessions.revokeSession(first.session.id, "expired_refresh_token");
		await logout("/logout", "post")({ body: { refresh_token: first.refresh_token } }, response());
		await expect(sessions.refreshTokenPair(successor.refresh_token)).rejects.toThrow("revoked");
	});
});
