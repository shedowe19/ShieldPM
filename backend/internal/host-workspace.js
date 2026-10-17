import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { UniqueViolationError } from "objection";
import { getEncryptionKey } from "../lib/config.js";
import errs from "../lib/error.js";
import apiValidator from "../lib/validator/api.js";
import HostWorkspaceItem from "../models/host_workspace_item.js";
import ProxyHost from "../models/proxy_host.js";
import ProxyHostTag from "../models/proxy_host_tag.js";
import { getValidationSchema } from "../schema/index.js";
import internalAuditLog from "./audit-log.js";
import internalHost from "./host.js";
import revisions from "./host-revisions.js";
import internalNginx from "./nginx.js";

const duplicateCodes = new Set(["SQLITE_CONSTRAINT_UNIQUE", "SQLITE_CONSTRAINT_PRIMARYKEY", "23505", "ER_DUP_ENTRY"]);
const savedViewSchema = {
	type: "object",
	additionalProperties: false,
	properties: {
		query: { type: "string", maxLength: 255 },
		tags: {
			type: "array",
			maxItems: 20,
			uniqueItems: true,
			items: { type: "string", pattern: "^[a-z0-9][a-z0-9._-]{0,31}$" },
		},
		enabled: { type: "boolean" },
		monitor: { enum: ["up", "down", "unknown", "paused"] },
		certificate_days: { type: "integer", minimum: 0, maximum: 365 },
	},
};

export const profileFields = [
	"block_exploits",
	"security_crowdsec",
	"ssl_forced",
	"http2_support",
	"hsts_enabled",
	"hsts_subdomains",
	"adv_limit_req_rate",
	"adv_limit_req_unit",
	"adv_limit_req_burst",
	"bandwidth_limit",
];
const userId = (access) => access.token.getUserId(1);
const pick = (value, keys) => Object.fromEntries(keys.map((key) => [key, value[key] ?? null]));
const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const stamp = (host) =>
	digest([
		host.id,
		host.owner_user_id,
		host.modified_on,
		host.enabled,
		host.certificate_id,
		pick(host, profileFields),
	]);
const sign = (payload) => createHmac("sha256", getEncryptionKey()).update(payload).digest("base64url");
const issuePlan = (plan) => {
	const payload = Buffer.from(JSON.stringify(plan)).toString("base64url");
	return `${payload}.${sign(payload)}`;
};
const parsePlan = (token, access) => {
	try {
		if (typeof token !== "string" || token.length > 100_000) throw new errs.ValidationError("Invalid bulk plan");
		const [payload, signature, extra] = token.split(".");
		const expected = Buffer.from(sign(payload));
		const supplied = Buffer.from(signature || "");
		if (extra || supplied.length !== expected.length || !timingSafeEqual(supplied, expected))
			throw new errs.ValidationError("Invalid bulk plan");
		const plan = JSON.parse(Buffer.from(payload, "base64url").toString());
		if (plan.owner !== userId(access)) throw new errs.ValidationError("Invalid bulk plan");
		if (plan.expires < Date.now()) throw new errs.ValidationError("Bulk plan expired; preview again");
		return plan;
	} catch (error) {
		if (error instanceof errs.ValidationError) throw error;
		throw new errs.ValidationError("Invalid bulk plan");
	}
};
const getItem = async (access, id, kind) => {
	await access.can("proxy_hosts:list");
	const item = await HostWorkspaceItem.query().findOne({ id, owner_user_id: userId(access), kind });
	if (!item) throw new errs.ItemNotFoundError(id);
	return item;
};
const visibleHost = async (access, id, operation = "get", trx = undefined) => {
	await access.can(`proxy_hosts:${operation}`, id);
	const grant = await access.can("proxy_hosts:get", id);
	const query = ProxyHost.query(trx).findById(id).where("is_deleted", 0);
	if (grant.permission_visibility !== "all") query.where("owner_user_id", userId(access));
	const host = await (trx ? query.forUpdate() : query);
	if (!host) throw new errs.ItemNotFoundError(id);
	return host;
};
const normalizeSettings = async (settings) => {
	if (
		!settings ||
		Array.isArray(settings) ||
		typeof settings !== "object" ||
		!Object.keys(settings).length ||
		Object.keys(settings).some((key) => !profileFields.includes(key))
	)
		throw new errs.ValidationError("Profile contains unsupported settings");
	if (
		settings.bandwidth_limit != null &&
		settings.bandwidth_limit !== "" &&
		!/^[1-9][0-9]{0,9}[kmg]?$/i.test(settings.bandwidth_limit)
	)
		throw new errs.ValidationError("Bandwidth must be a positive byte rate, optionally followed by k, m or g");
	return apiValidator(getValidationSchema("/nginx/proxy-hosts/{hostID}", "put"), settings);
};
const candidateSettings = (host, settings) => {
	if ((settings.ssl_forced || settings.hsts_enabled || settings.hsts_subdomains) && !host.certificate_id) {
		throw new errs.ValidationError("A certificate is required for this TLS profile");
	}
	const patch = internalHost.cleanSslHstsData(false, { ...settings }, host);
	const fields = new Set(Object.keys(settings));
	if (["ssl_forced", "hsts_enabled", "hsts_subdomains"].some((key) => fields.has(key)))
		for (const key of ["ssl_forced", "hsts_enabled", "hsts_subdomains"]) fields.add(key);
	return Object.fromEntries(Object.entries(patch).filter(([key]) => fields.has(key)));
};

const internalHostWorkspace = {
	/** @param {import('../lib/types.js').Access} access @param {Object} filters */
	async hosts(access, filters = {}) {
		const grant = await access.can("proxy_hosts:list");
		const query = ProxyHost.query().where("proxy_host.is_deleted", 0);
		if (grant.permission_visibility !== "all") query.where("proxy_host.owner_user_id", userId(access));
		if (filters.query)
			query.whereExists(
				ProxyHost.relatedQuery("host_domains").where(
					"domain_name",
					"like",
					`%${String(filters.query).replaceAll("%", "").replaceAll("_", "")}%`,
				),
			);
		for (const tag of filters.tags || [])
			query.whereExists(
				ProxyHostTag.query().select("id").whereColumn("host_id", "proxy_host.id").where("tag", tag),
			);
		if (typeof filters.enabled === "boolean") query.where("proxy_host.enabled", filters.enabled ? 1 : 0);
		if (filters.monitor) {
			const monitor = () =>
				ProxyHost.knex()("proxy_host_monitor")
					.select("id")
					.where("proxy_host_monitor.host_id", ProxyHost.knex().ref("proxy_host.id"));
			if (filters.monitor === "paused") {
				// publicStatus derives pause from current switches, not the last measured state.
				query.where((paused) =>
					paused.where("proxy_host.enabled", 0).orWhereExists(monitor().where("enabled", false)),
				);
			} else {
				query.where("proxy_host.enabled", 1).where((active) => {
					active.whereExists(monitor().where("enabled", true).where("state", filters.monitor));
					// An enabled host without a monitor has no observation yet.
					if (filters.monitor === "unknown") active.orWhereNotExists(monitor());
				});
			}
		}
		if (filters.certificate_days != null)
			query.whereExists(
				ProxyHost.knex()("certificate")
					.select("id")
					.where("id", ProxyHost.knex().ref("proxy_host.certificate_id"))
					.where("is_deleted", 0)
					.where(
						"expires_on",
						"<",
						new Date(Date.now() + (filters.certificate_days + 1) * 86400000).toISOString().slice(0, 10),
					),
			);
		const count = /** @type {any} */ (await query.clone().count("proxy_host.id as total").first());
		const limit = filters.limit ?? 100;
		const page = filters.page ?? 1;
		const rows = await query
			.select("proxy_host.id", "proxy_host.enabled", "proxy_host.owner_user_id", "proxy_host.modified_on")
			.withGraphFetched("host_domains")
			.orderBy("proxy_host.id")
			.limit(limit)
			.offset((page - 1) * limit);
		const ids = rows.map((host) => host.id);
		const tags = ids.length ? await ProxyHostTag.query().whereIn("host_id", ids) : [];
		return {
			items: rows.map((host) => ({
				id: host.id,
				enabled: host.enabled,
				domain_names: host.host_domains.map((domain) => domain.domain_name),
				tags: tags.filter((tag) => tag.host_id === host.id).map((tag) => tag.tag),
			})),
			pagination: {
				page,
				limit,
				total_items: Number(count.total),
				total_pages: Math.ceil(Number(count.total) / limit),
			},
		};
	},
	/** Lightweight projection for selectors; never returns proxy credentials or runtime configuration. */
	async options(access, query = "") {
		const grant = await access.can("proxy_hosts:list");
		const builder = ProxyHost.query()
			.where("is_deleted", 0)
			.select("id")
			.withGraphFetched("host_domains")
			.orderBy("id");
		if (grant.permission_visibility !== "all") builder.where("owner_user_id", userId(access));
		if (query)
			builder.whereExists(
				ProxyHost.relatedQuery("host_domains").where(
					"domain_name",
					"like",
					`%${query.replaceAll("%", "").replaceAll("_", "")}%`,
				),
			);
		return (await builder).map((host) => ({
			id: host.id,
			domain_names: host.host_domains.map((domain) => domain.domain_name),
		}));
	},
	/** @param {import('../lib/types.js').Access} access @param {number} id @param {string[]} tags */
	async setTags(access, id, tags) {
		await visibleHost(access, id, "update");
		const normalized = [...new Set(tags.map((tag) => tag.trim().toLowerCase()))];
		if (normalized.length > 20 || normalized.some((tag) => !/^[a-z0-9][a-z0-9._-]{0,31}$/.test(tag)))
			throw new errs.ValidationError(
				"Use up to 20 short tags containing letters, digits, dot, underscore or dash",
			);
		await ProxyHost.transaction(async (trx) => {
			await visibleHost(access, id, "update", trx);
			await ProxyHostTag.query(trx).where("host_id", id).delete();
			for (const tag of normalized) await ProxyHostTag.query(trx).insert({ host_id: id, tag });
		});
		await internalAuditLog.add(access, {
			action: "updated",
			object_type: "proxy-host",
			object_id: id,
			meta: { tags: normalized },
		});
		return { host_id: id, tags: normalized };
	},
	/** Personal saved views and named security/rate profiles. */
	async list(access) {
		await access.can("proxy_hosts:list");
		return HostWorkspaceItem.query().where("owner_user_id", userId(access)).orderBy("name");
	},
	async save(access, data) {
		await access.can("proxy_hosts:list");
		if (data.kind === "profile") {
			await access.can("proxy_hosts:update");
			data.definition = { settings: await normalizeSettings(data.definition.settings) };
		} else if (data.kind === "view") data.definition = await apiValidator(savedViewSchema, data.definition);
		else throw new errs.ValidationError("Unknown saved item type");
		if (!data.name?.trim()) throw new errs.ValidationError("A name is required");
		if (data.id) await getItem(access, data.id, data.kind);
		try {
			const row = {
				name: data.name.trim(),
				kind: data.kind,
				definition: data.definition,
				owner_user_id: userId(access),
			};
			return await (data.id
				? HostWorkspaceItem.query().patchAndFetchById(data.id, row)
				: HostWorkspaceItem.query().insertAndFetch(row));
		} catch (error) {
			if (
				error instanceof UniqueViolationError ||
				duplicateCodes.has(error?.code) ||
				duplicateCodes.has(error?.nativeError?.code)
			)
				throw new errs.ValidationError("A saved item with this name already exists");
			throw error;
		}
	},
	async remove(access, id, kind) {
		await getItem(access, id, kind);
		await HostWorkspaceItem.query().deleteById(id);
		return true;
	},
	/** Produce a signed, short-lived plan bound to each current host and private profile. */
	async preview(access, profileId, hostIds) {
		const profile = await getItem(access, profileId, "profile");
		const accepted = [];
		const results = [];
		for (const id of hostIds) {
			try {
				const host = await visibleHost(access, id, "update");
				const settings = candidateSettings(host, profile.definition.settings);
				accepted.push({ id, stamp: stamp(host), settings });
				results.push({ id, ready: true, before: pick(host, Object.keys(settings)), after: settings });
			} catch (error) {
				results.push({ id, ready: false, error: error.public ? error.message : "Unable to prepare this host" });
			}
		}
		return {
			results,
			plan: accepted.length
				? issuePlan({
						owner: userId(access),
						profile_id: profileId,
						definition: digest(profile.definition),
						expires: Date.now() + 300000,
						hosts: accepted,
					})
				: null,
		};
	},
	/** Apply valid hosts once, with a shared validated activation and conditional DB rollback. */
	async apply(access, token) {
		const plan = parsePlan(token, access);
		const profile = await getItem(access, plan.profile_id, "profile");
		if (digest(profile.definition) !== plan.definition)
			throw new errs.ValidationError("Profile changed; preview again");
		return internalNginx.withConfigurationLock(async () => {
			const applied = [];
			const results = [];
			for (const planned of plan.hosts) {
				try {
					await visibleHost(access, planned.id, "update");
					await revisions.record(access, planned.id, "baseline");
					await ProxyHost.transaction(async (trx) => {
						const current = await visibleHost(access, planned.id, "update", trx);
						if (stamp(current) !== planned.stamp)
							throw new errs.ValidationError("Host changed; preview again");
						const patch = candidateSettings(current, planned.settings);
						await ProxyHost.query(trx).findById(current.id).patch(patch);
						applied.push({ id: current.id, before: pick(current, Object.keys(patch)), patch });
					});
					results.push({ id: planned.id, success: true });
				} catch (error) {
					results.push({
						id: planned.id,
						success: false,
						error: error.public ? error.message : "Unable to update this host",
					});
				}
			}
			if (applied.length) {
				let activated = false;
				try {
					await internalNginx.bulkGenerateConfigGroupsUnlocked(
						[{ model: ProxyHost, hostType: "proxy_host", hosts: applied }],
						{ reload: true, throwOnError: true },
					);
					activated = true;
					for (const host of applied) await revisions.record(access, host.id, "profile");
				} catch {
					const conflicts = new Set();
					for (const host of applied)
						await ProxyHost.transaction(async (trx) => {
							const current = await ProxyHost.query(trx).findById(host.id).forUpdate();
							if (
								digest(pick(current, Object.keys(host.patch))) ===
								digest(pick(host.patch, Object.keys(host.patch)))
							)
								await ProxyHost.query(trx).findById(host.id).patch(host.before);
							else conflicts.add(host.id);
						});
					// After a history failure or concurrent field update, render the compensated
					// database state again; the activation engine already restores rejected files.
					if (activated || conflicts.size)
						await internalNginx.bulkGenerateConfigGroupsUnlocked(
							[{ model: ProxyHost, hostType: "proxy_host", hosts: applied }],
							{ reload: true, throwOnError: true },
						);
					return {
						activated: false,
						results: results.map((result) =>
							result.success
								? {
										...result,
										success: false,
										error: conflicts.has(result.id)
											? "Activation failed; a concurrent edit was preserved. Review this host."
											: "Activation failed; previous settings restored",
									}
								: result,
						),
					};
				}
				for (const host of applied)
					await internalAuditLog.add(access, {
						action: "updated",
						object_type: "proxy-host",
						object_id: host.id,
						meta: { profile: profile.name, settings: host.patch },
					});
			}
			return { activated: applied.length > 0, results };
		});
	},
};
export default internalHostWorkspace;
