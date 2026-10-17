import dayjs from "dayjs";
import errs from "../lib/error.js";
import AuthSession from "../models/auth-session.js";
import audit from "./audit-log.js";

const PAGE_SIZE = 100;
const publicColumns = [
	"id",
	"family_id",
	"created_at",
	"expires_at",
	"last_used_at",
	"created_ip",
	"created_user_agent",
];
const timestamp = (value) => (value ? dayjs(value).toISOString() : null);

/** Require a current account and its own browser refresh family, never another user's cookie. */
const context = async (access, rawRefreshToken) => {
	const userId = access.token.getUserId(0);
	if (!Number.isSafeInteger(userId) || userId <= 0) throw new errs.UnauthorizedError("Authentication required");
	await access.can("users:update", userId);
	if (typeof rawRefreshToken !== "string" || !rawRefreshToken) {
		throw new errs.ValidationError("Sign in again to manage browser sessions");
	}
	const current = await AuthSession.query()
		.findOne({ ...AuthSession.buildLookup(rawRefreshToken), user_id: userId })
		.whereNull("revoked_at")
		.where("expires_at", ">", dayjs().format("YYYY-MM-DD HH:mm:ss"));
	if (!current) throw new errs.ValidationError("This browser session cannot manage sessions; sign in again");
	return { userId, currentFamily: current.family_id };
};

const active = (userId) =>
	AuthSession.query()
		.where("user_id", userId)
		.whereNull("revoked_at")
		.whereNull("rotated_at")
		.whereNull("replaced_by_session_id")
		.where("expires_at", ">", dayjs().format("YYYY-MM-DD HH:mm:ss"));

const list = async (access, rawRefreshToken) => {
	const { userId, currentFamily } = await context(access, rawRefreshToken);
	const rows = await active(userId)
		.select(...publicColumns)
		.orderBy("id", "desc")
		.limit(PAGE_SIZE + 1);
	let families = [...new Map(rows.map((row) => [row.family_id, row])).values()].slice(0, PAGE_SIZE);
	if (!families.some((row) => row.family_id === currentFamily)) {
		const current = await active(userId)
			.where("family_id", currentFamily)
			.select(...publicColumns)
			.first();
		if (current) families = [current, ...families.slice(0, PAGE_SIZE - 1)];
	}
	const firstSeen = families.length
		? await AuthSession.query()
				.where("user_id", userId)
				.whereIn(
					"family_id",
					families.map((row) => row.family_id),
				)
				.groupBy("family_id")
				.select("family_id")
				.min("created_at as first_seen")
		: [];
	const started = new Map(firstSeen.map((row) => [row.family_id, /** @type {any} */ (row).first_seen]));
	return {
		sessions: families.map((row) => ({
			family_id: row.family_id,
			current: row.family_id === currentFamily,
			created_at: timestamp(started.get(row.family_id) || row.created_at),
			last_active_at: timestamp(row.last_used_at || row.created_at),
			expires_at: timestamp(row.expires_at),
			ip: row.created_ip,
			user_agent: row.created_user_agent,
		})),
		has_more: rows.length > PAGE_SIZE,
		access_token_ttl_minutes: 15,
	};
};

/** Revoke an entire device family, including rotated refresh predecessors. */
const revoke = async (access, rawRefreshToken, familyId) => {
	if (
		typeof familyId !== "string" ||
		!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(familyId)
	) {
		throw new errs.ValidationError("Invalid session family ID");
	}
	const { userId, currentFamily } = await context(access, rawRefreshToken);
	if (familyId === currentFamily) throw new errs.ValidationError("Use logout to end the current browser session");
	const count = await AuthSession.query()
		.where({ user_id: userId, family_id: familyId })
		.whereNull("revoked_at")
		.patch({ revoked_at: AuthSession.knex().fn.now(), revoked_reason: "device_revoked" });
	if (!count) throw new errs.ItemNotFoundError();
	await audit.add(access, {
		action: "updated",
		object_type: "user",
		object_id: userId,
		meta: { session_revoked: true, family_id: familyId },
	});
	return { revoked: true };
};

const revokeOthers = async (access, rawRefreshToken) => {
	const { userId, currentFamily } = await context(access, rawRefreshToken);
	const count = await AuthSession.query()
		.where("user_id", userId)
		.whereNot("family_id", currentFamily)
		.whereNull("revoked_at")
		.patch({ revoked_at: AuthSession.knex().fn.now(), revoked_reason: "other_devices_revoked" });
	await audit.add(access, {
		action: "updated",
		object_type: "user",
		object_id: userId,
		meta: { other_sessions_revoked: true },
	});
	return { revoked: count };
};

export default { list, revoke, revokeOthers };
