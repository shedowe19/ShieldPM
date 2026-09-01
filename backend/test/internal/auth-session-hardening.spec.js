import fs from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

let dataPath;
let knex;
let AuthSession;
let authSessionService;

const insertUser = (id, email) =>
	knex("user").insert({
		id,
		name: `User ${id}`,
		nickname: `user${id}`,
		email,
		avatar: "",
		roles: JSON.stringify(id === 1 ? ["admin"] : []),
		is_deleted: 0,
		is_disabled: 0,
	});

const parseRoles = (user) => {
	user.roles = typeof user.roles === "string" ? JSON.parse(user.roles) : user.roles;
	return user;
};

const issueImpersonation = async () => {
	const actor = parseRoles(await knex("user").where({ id: 1 }).first());
	const target = parseRoles(await knex("user").where({ id: 2 }).first());
	const actorPair = await authSessionService.issueTokenPair(actor, "user", {
		authenticationMethods: ["pwd", "mfa:totp"],
	});
	const impersonation = await authSessionService.issueImpersonationPair({
		actorSessionId: actorPair.session.id,
		actorUserId: actor.id,
		targetUser: target,
	});
	return { actor, actorPair, impersonation, target };
};

const expectInvalidActorBlocksAccessAndRefresh = async ({ invalidate, restore = async () => {} }) => {
	const accessContext = await issueImpersonation();
	await invalidate(accessContext);
	await expect(
		authSessionService.validateAccessSession(accessContext.impersonation.pair.session.id, accessContext.target.id, {
			fid: accessContext.impersonation.pair.session.family_id,
			act: {
				sub: accessContext.actor.id,
				sid: accessContext.impersonation.actor.session.id,
			},
		}),
	).rejects.toThrow("Impersonation actor session is no longer authorized");
	await expect(AuthSession.query().findById(accessContext.impersonation.pair.session.id)).resolves.toMatchObject({
		revoked_reason: "impersonation_actor_invalid",
	});

	await restore(accessContext);
	const refreshContext = await issueImpersonation();
	await invalidate(refreshContext);
	await expect(
		authSessionService.refreshTokenPair(refreshContext.impersonation.pair.refresh_token),
	).rejects.toMatchObject({
		message: "Impersonation actor session is no longer authorized",
		status: 401,
	});
	await expect(AuthSession.query().findById(refreshContext.impersonation.pair.session.id)).resolves.toMatchObject({
		revoked_reason: "impersonation_actor_invalid",
	});
};

beforeAll(async () => {
	dataPath = fs.mkdtempSync(path.join(tmpdir(), "shieldpm-auth-session-"));
	fs.mkdirSync(path.join(dataPath, "shieldpm"), { recursive: true });
	process.env.DATA_PATH = dataPath;
	vi.resetModules();

	const [{ default: db }, authSessionMigration, hardeningMigration, authSessionModel, service] = await Promise.all([
		import("../../db.js"),
		import("../../migrations/20260316122700_add_auth_sessions.js"),
		import("../../migrations/20260831110000_harden_auth_identity.js"),
		import("../../models/auth-session.js"),
		import("../../internal/auth-session-service.js"),
	]);
	knex = db();
	AuthSession = authSessionModel.default;
	authSessionService = service.default;

	await knex.schema.createTable("user", (table) => {
		table.increments("id").primary();
		table.string("name").notNullable();
		table.string("nickname").notNullable();
		table.string("email").notNullable();
		table.string("avatar").notNullable().defaultTo("");
		table.json("roles").notNullable();
		table.integer("is_deleted").notNullable().defaultTo(0);
		table.integer("is_disabled").notNullable().defaultTo(0);
	});
	await authSessionMigration.up(knex);
	await hardeningMigration.up(knex);
});

beforeEach(async () => {
	await knex("auth_sessions").delete();
	await knex("user").delete();
	await insertUser(1, "admin@example.test");
	await insertUser(2, "target@example.test");
});

afterAll(async () => {
	await knex.destroy();
	fs.rmSync(dataPath, { force: true, recursive: true });
	delete process.env.DATA_PATH;
});

describe("DB-bound authentication sessions", () => {
	it("returns one success and one cookie-preserving conflict for a parallel refresh", async () => {
		const user = await knex("user").where({ id: 1 }).first();
		parseRoles(user);
		const initial = await authSessionService.issueTokenPair(user, "user", { authenticationMethods: ["pwd"] });

		const results = await Promise.allSettled([
			authSessionService.refreshTokenPair(initial.refresh_token),
			authSessionService.refreshTokenPair(initial.refresh_token),
		]);
		const fulfilled = results.filter((result) => result.status === "fulfilled");
		const rejected = results.filter((result) => result.status === "rejected");
		expect(fulfilled).toHaveLength(1);
		expect(rejected).toHaveLength(1);
		expect(rejected[0].reason).toMatchObject({ status: 409, preserveAuthCookies: true });

		const family = await AuthSession.query().where("family_id", initial.session.family_id);
		expect(family).toHaveLength(2);
		expect(family.every((session) => !session.revoked_at)).toBe(true);
	});

	it("commits a family revocation when a rotated token is replayed after the grace window", async () => {
		const user = await knex("user").where({ id: 1 }).first();
		parseRoles(user);
		const initial = await authSessionService.issueTokenPair(user);
		await authSessionService.refreshTokenPair(initial.refresh_token);
		await AuthSession.query()
			.patch({ rotated_at: new Date(Date.now() - 60_000) })
			.where("id", initial.session.id);

		await expect(authSessionService.refreshTokenPair(initial.refresh_token)).rejects.toMatchObject({ status: 401 });
		const family = await AuthSession.query().where("family_id", initial.session.family_id);
		expect(family.every((session) => Boolean(session.revoked_at))).toBe(true);
	});

	it("rejects access claims after server-side family revocation", async () => {
		const user = await knex("user").where({ id: 1 }).first();
		parseRoles(user);
		const pair = await authSessionService.issueTokenPair(user);
		await expect(
			authSessionService.validateAccessSession(pair.session.id, user.id, { fid: pair.session.family_id }),
		).resolves.toMatchObject({ id: pair.session.id });
		await authSessionService.revokeFamily(pair.session.family_id, "test");
		await expect(
			authSessionService.validateAccessSession(pair.session.id, user.id, { fid: pair.session.family_id }),
		).rejects.toMatchObject({ status: 400 });
	});

	it("revokes the complete refresh family on logout, including previously rotated access sessions", async () => {
		const user = await knex("user").where({ id: 1 }).first();
		parseRoles(user);
		const initial = await authSessionService.issueTokenPair(user);
		const rotated = await authSessionService.refreshTokenPair(initial.refresh_token);

		await authSessionService.revokeByRefreshToken(rotated.refresh_token, "logout");

		const family = await AuthSession.query().where("family_id", initial.session.family_id);
		expect(family).toHaveLength(2);
		expect(family.every((session) => session.revoked_reason === "logout")).toBe(true);
		await expect(
			authSessionService.validateAccessSession(initial.session.id, user.id, {
				fid: initial.session.family_id,
			}),
		).rejects.toMatchObject({ status: 400 });
	});

	it("rotates the actor, binds the target session, and restores only the exact actor session", async () => {
		const { actor, actorPair, impersonation } = await issueImpersonation();

		const targetSession = await AuthSession.query().findById(impersonation.pair.session.id);
		expect(targetSession).toMatchObject({
			actor_user_id: actor.id,
			actor_session_id: impersonation.actor.session.id,
		});
		await expect(
			authSessionService.validateAccessSession(actorPair.session.id, actor.id, {
				fid: actorPair.session.family_id,
			}),
		).rejects.toMatchObject({ status: 400 });
		const restored = await authSessionService.restoreImpersonation({
			targetRefreshToken: impersonation.pair.refresh_token,
			actorRefreshToken: impersonation.actor.refresh_token,
		});
		expect(restored.user.id).toBe(actor.id);
		const revokedTarget = await AuthSession.query().findById(targetSession.id);
		expect(revokedTarget.revoked_reason).toBe("impersonation_restored");
	});

	it("rejects target access and refresh after the actor family is revoked", async () => {
		await expectInvalidActorBlocksAccessAndRefresh({
			invalidate: ({ impersonation }) =>
				authSessionService.revokeFamily(impersonation.actor.session.family_id, "actor_logout"),
		});
	});

	it.each([
		["disabled", { is_disabled: 1 }],
		["deleted", { is_deleted: 1 }],
	])("rejects target access and refresh when the actor is %s", async (_state, actorPatch) => {
		await expectInvalidActorBlocksAccessAndRefresh({
			invalidate: ({ actor }) => knex("user").where({ id: actor.id }).update(actorPatch),
			restore: ({ actor }) => knex("user").where({ id: actor.id }).update({ is_deleted: 0, is_disabled: 0 }),
		});
	});

	it("rejects target access and refresh when the actor loses impersonation permission", async () => {
		await expectInvalidActorBlocksAccessAndRefresh({
			invalidate: ({ actor }) =>
				knex("user")
					.where({ id: actor.id })
					.update({ roles: JSON.stringify([]) }),
			restore: ({ actor }) =>
				knex("user")
					.where({ id: actor.id })
					.update({ roles: JSON.stringify(["admin"]) }),
		});
	});
});
