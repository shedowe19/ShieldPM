import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import _ from "lodash";
import { accessListFiles } from "../lib/access-list-files.js";
import { captureConfigurationFiles, restoreConfigurationFiles } from "../lib/configuration-files.js";
import { decrypt, encrypt } from "../lib/encryption.js";
import errs from "../lib/error.js";
import { withHostDomainClaims } from "../lib/host-domain-claims.js";
import { sanitizeHostMeta } from "../lib/host-response.js";
import { rethrowAfterHostRollback } from "../lib/host-rollback.js";
import { notifyProxyHostDomainsChanged } from "../lib/proxy-host-domain-events.js";
import { validateTrustedHostPolicies } from "../lib/trusted-host-policies.js";
import AccessList from "../models/access_list.js";
import Certificate from "../models/certificate.js";
import HostDomain from "../models/host_domain.js";
import ProxyHost from "../models/proxy_host.js";
import Revision from "../models/proxy_host_revision.js";
import internalAuditLog from "./audit-log.js";
import { validateHostFirewall, withFirewallReferences } from "./firewall-policy.js";
import internalHost from "./host.js";
import internalNginx from "./nginx.js";
import { validateRelayConfigForHost } from "./upload-relay.js";

const stable = (value) => {
	if (Array.isArray(value)) return value.map(stable);
	if (value && typeof value === "object")
		return Object.fromEntries(
			Object.keys(value)
				.sort()
				.map((key) => [key, stable(value[key])]),
		);
	return value;
};
export const fingerprint = (value) =>
	createHash("sha256")
		.update(JSON.stringify(stable(value)))
		.digest("hex");
const hostFields = (host) =>
	_.omit(host, [
		"id",
		"created_on",
		"modified_on",
		"is_deleted",
		"domain_names",
		"host_domains",
		"owner",
		"certificate",
		"access_list",
		"tor_onion",
	]);

const hostTimestampFields = ["created_on", "modified_on", "git_last_sync", "maintenance_start", "maintenance_end"];
const usesMysqlDates = (trx) => ["mysql", "mysql2"].includes(trx.client.config.client);
const rollbackConflicts = new Map([
	[1020, "ER_CHECKREAD"],
	[1205, "ER_LOCK_WAIT_TIMEOUT"],
	[1213, "ER_LOCK_DEADLOCK"],
]);
const retryableRollbackError = (error) => {
	if (!usesMysqlDates(ProxyHost.knex())) return false;
	const native = error?.nativeError ?? error;
	return native?.code !== undefined && rollbackConflicts.get(native?.errno) === native.code;
};

/** Restore JSON-serialized DATETIME instants through mysql2's configured connection timezone. */
const restoreDatabaseTimestamps = (row, trx) => {
	const result = { ...row };
	if (usesMysqlDates(trx)) {
		for (const field of hostTimestampFields) {
			const value = result[field];
			if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
				const instant = new Date(value);
				if (!Number.isFinite(instant.getTime()))
					throw new errs.ConfigurationError(`Invalid captured ${field} timestamp`);
				result[field] = instant;
			}
		}
	}
	return result;
};

/** Patch a trusted snapshot without restamping captured MySQL temporal columns in model hooks. */
const patchCapturedHost = async (trx, hostId, fields) => {
	const timestampFields = usesMysqlDates(trx) ? hostTimestampFields : ["created_on", "modified_on"];
	await ProxyHost.query(trx).findById(hostId).patch(_.omit(fields, timestampFields));
	const timestamps = restoreDatabaseTimestamps(_.pick(fields, timestampFields), trx);
	if (Object.keys(timestamps).length) await trx(ProxyHost.tableName).where("id", hostId).update(timestamps);
};
const secretKey =
	/(?:password|secret|credential|private.?key|token|advanced.?config|forward.?query|php.?override|internal.?note|note|support.?url|(?:^|_)headers?$|config(?:uration)?)/i;
/** User-visible diffs never return free-form directives, credentials, or plugin configuration. */
export function redactRevision(value, key = "") {
	if (secretKey.test(key)) return value == null || value === "" ? value : "[REDACTED]";
	if (Array.isArray(value)) return value.map((item) => redactRevision(item));
	if (value && typeof value === "object")
		return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, redactRevision(item, name)]));
	// URLs can embed credentials or signed query strings, including inside plugin metadata.
	if (typeof value === "string" && /(?:https?|ssh):\/\//i.test(value))
		return value
			.replace(/(\w+:\/\/)(?:[^/@\s]+@)/g, "$1[REDACTED]@")
			.replace(/([?&][^=\s]+=)[^&\s]+/g, "$1[REDACTED]");
	return value;
}
const changesBetween = (current, target) => {
	const before = redactRevision(hostFields(current));
	const after = redactRevision(hostFields(target));
	const changes = [];
	for (const field of [...new Set([...Object.keys(before), ...Object.keys(after), "domain_names"])].sort()) {
		const oldValue = field === "domain_names" ? current.domain_names : before[field];
		const newValue = field === "domain_names" ? target.domain_names : after[field];
		if (
			!_.isEqual(hostFields(current)[field], hostFields(target)[field]) ||
			(field === "domain_names" && !_.isEqual(oldValue, newValue))
		)
			changes.push({ field, before: oldValue ?? null, after: newValue ?? null });
	}
	return changes;
};

const authorize = async (access, hostId, permission = "get") => {
	const rights = await access.can(`proxy_hosts:${permission}`, hostId);
	const query = ProxyHost.query().findById(hostId).where("is_deleted", 0);
	if (rights.permission_visibility !== "all") query.where("owner_user_id", access.token.getUserId(1));
	const host = await query;
	if (!host) throw new errs.ItemNotFoundError(hostId);
	return host;
};

/** Snapshot full DB state plus referenced mutable authorization/TLS files, encrypted at rest.
 * @param {number} hostId
 * @param {{includeDeleted?: boolean}} [options]
 */
export async function captureHostState(hostId, options = {}) {
	const query = ProxyHost.query().findById(hostId).context({ preserveDatabaseTimestamps: true });
	if (!options.includeDeleted) query.where("is_deleted", 0);
	const model = await query.withGraphFetched("[host_domains,certificate,access_list.[items,clients]]");
	if (!model) throw new errs.ItemNotFoundError(hostId);
	const host = JSON.parse(JSON.stringify(model));
	const paths = [internalNginx.getConfigName("proxy_host", hostId)];
	if (host.access_list_id) {
		const accessFiles = accessListFiles({ id: host.access_list_id, meta: host.access_list?.meta });
		paths.push(accessFiles.auth, accessFiles.ca);
	}
	if (host.certificate?.provider && ["custom", "internal", "letsencrypt"].includes(host.certificate.provider)) {
		const base =
			host.certificate.provider === "letsencrypt"
				? "/data/tls/certbot/live"
				: `/data/tls/${host.certificate.provider}`;
		paths.push(
			`${base}/npm-${host.certificate_id}/fullchain.pem`,
			`${base}/npm-${host.certificate_id}/privkey.pem`,
		);
	}
	const files = await captureConfigurationFiles(paths);
	return { host, files, fingerprint: fingerprint({ host, files }) };
}

/** Restore captured DB fields/domains and exact config bytes after a failed activation; caller holds config lock. */
export async function restoreHostState(snapshot) {
	// A concurrent status writer can invalidate MariaDB's snapshot after the claim reads.
	// Replay only this database compensation in a fresh transaction; files/reloads run once.
	for (let attempt = 0; ; attempt++) {
		try {
			await withHostDomainClaims(
				{
					hostType: "proxy",
					hostId: snapshot.host.id,
					domainNames: snapshot.host.is_deleted ? [] : snapshot.host.domain_names,
				},
				async (trx) => {
					await patchCapturedHost(trx, snapshot.host.id, {
						...hostFields(snapshot.host),
						..._.pick(snapshot.host, ["created_on", "modified_on"]),
						domain_names: snapshot.host.domain_names,
						is_deleted: snapshot.host.is_deleted ?? 0,
					});
					await HostDomain.query(trx).delete().where("proxy_host_id", snapshot.host.id);
					for (const domain of snapshot.host.host_domains || [])
						await trx(HostDomain.tableName).insert(
							restoreDatabaseTimestamps(
								_.pick(domain, ["id", "proxy_host_id", "domain_name", "created_on", "modified_on"]),
								trx,
							),
						);
				},
			);
			break;
		} catch (error) {
			if (attempt >= 2 || !retryableRollbackError(error)) throw error;
			await delay(25 * (attempt + 1));
		}
	}
	await restoreConfigurationFiles(snapshot.files);
}

const publicRevision = (revision) =>
	_.pick(revision, ["id", "host_id", "actor_user_id", "action", "created_on", "fingerprint"]);
const decode = (row) => JSON.parse(decrypt(row.encrypted_snapshot));
const loadRevision = async (hostId, revisionId) => {
	const row = await Revision.query().findById(revisionId).where("host_id", hostId);
	if (!row) throw new errs.ItemNotFoundError(revisionId);
	return row;
};
const assertReferencesCurrent = async (target, hostId) => {
	// Shared certificates/access lists have independent ownership and affect other hosts.
	// Never overwrite them from a host rollback. Require unchanged referenced material.
	const references = target.files.filter((file) => file.path !== internalNginx.getConfigName("proxy_host", hostId));
	if (fingerprint(await captureConfigurationFiles(references.map((file) => file.path))) !== fingerprint(references))
		throw new errs.ValidationError(
			"A referenced certificate or access list changed; restore that shared resource separately",
		);
	if (target.host.access_list_id) {
		const list = await AccessList.query()
			.findById(target.host.access_list_id)
			.where("is_deleted", 0)
			.withGraphFetched("[items,clients]");
		if (!list || fingerprint(JSON.parse(JSON.stringify(list))) !== fingerprint(target.host.access_list))
			throw new errs.ValidationError(
				"Referenced access-list rules changed; review that shared resource separately",
			);
	}
	if (target.host.certificate_id) {
		const certificate = await Certificate.query().findById(target.host.certificate_id).where("is_deleted", 0);
		if (
			!certificate ||
			fingerprint(JSON.parse(JSON.stringify(certificate))) !== fingerprint(target.host.certificate)
		)
			throw new errs.ValidationError("Referenced certificate changed; review that shared resource separately");
	}
};

const service = {
	/** Record only successfully activated states. Can be called inside an already-held lock. */
	record: async (access, hostId, action = "updated") => {
		const snapshot = await captureHostState(hostId);
		const encryptedSnapshot = encrypt(JSON.stringify(snapshot));
		return Revision.transaction(async (trx) => {
			const latest = await Revision.query(trx).where("host_id", hostId).orderBy("id", "desc").first();
			if (latest?.fingerprint === snapshot.fingerprint) return publicRevision(latest);
			const row = await Revision.query(trx).insert({
				host_id: hostId,
				actor_user_id: access.token.getUserId(1),
				action,
				fingerprint: snapshot.fingerprint,
				encrypted_snapshot: encryptedSnapshot,
			});
			// Keep the newest 100 complete versions per host; no unbounded encrypted file history.
			const boundary = await Revision.query(trx)
				.select("id")
				.where("host_id", hostId)
				.orderBy("id", "desc")
				.offset(99)
				.limit(1)
				.first();
			if (boundary) await Revision.query(trx).delete().where("host_id", hostId).where("id", "<", boundary.id);
			return publicRevision(row);
		});
	},
	/** List an authorized host's versions without encrypted payloads. */
	list: async (access, hostId) => {
		await authorize(access, hostId);
		return (await Revision.query().where("host_id", hostId).orderBy("id", "desc").limit(100)).map(publicRevision);
	},
	/** Build a reviewable host-scoped restore plan; expected fingerprint guards subsequent changes. */
	plan: async (access, hostId, revisionId) => {
		await authorize(access, hostId);
		const row = await loadRevision(hostId, revisionId);
		const current = await captureHostState(hostId);
		const target = decode(row);
		await assertReferencesCurrent(target, hostId);
		return {
			revision: publicRevision(row),
			expected_fingerprint: current.fingerprint,
			changes: changesBetween(current.host, target.host),
			configuration: {
				current_sha256: fingerprint(current.files[0]?.content),
				target_sha256: fingerprint(target.files[0]?.content),
			},
			target: redactRevision({ ...hostFields(target.host), domain_names: target.host.domain_names }),
		};
	},
	/** Restore one reviewed revision and keep the previous listener/DB/sidecars on validation failure. */
	restore: (access, hostId, revisionId, expectedFingerprint) =>
		internalNginx.withConfigurationLock(async () => {
			await authorize(access, hostId, "update");
			const current = await captureHostState(hostId);
			if (expectedFingerprint !== current.fingerprint)
				throw new errs.ValidationError("Host changed since the restore plan was loaded; review a new plan");
			const target = decode(await loadRevision(hostId, revisionId));
			await assertReferencesCurrent(target, hostId);
			const candidate = {
				...hostFields(target.host),
				id: hostId,
				domain_names: target.host.domain_names,
				owner_user_id: current.host.owner_user_id,
				meta: sanitizeHostMeta(target.host.meta),
			};
			validateTrustedHostPolicies(candidate, current.host);
			await internalHost.validateReferences(access, candidate, current.host);
			internalHost.validateDomainNames(candidate.domain_names);
			for (const domain of candidate.domain_names)
				if (
					!current.host.domain_names.some((name) => name.toLowerCase() === domain.toLowerCase()) &&
					(await internalHost.isHostnameTaken(domain, "proxy", hostId)).is_taken
				)
					throw new errs.ValidationError("A revision domain is now assigned to another host");
			await validateHostFirewall(access, candidate, current.host);
			if (candidate.upload_relay_enabled) await validateRelayConfigForHost(candidate);
			let revision;
			try {
				await withFirewallReferences(
					candidate,
					current.host,
					() =>
						withHostDomainClaims(
							{
								hostType: "proxy",
								hostId,
								domainNames: candidate.domain_names,
								retainedDomainNames: current.host.domain_names,
							},
							async (trx) => {
								await patchCapturedHost(trx, hostId, _.omit(candidate, ["id", "domain_names"]));
								await HostDomain.query(trx).delete().where("proxy_host_id", hostId);
								for (const domain of candidate.domain_names)
									await HostDomain.query(trx).insert({ proxy_host_id: hostId, domain_name: domain });
							},
						),
					{ lockHeld: true },
				);
				const status = await internalNginx.configureHost(ProxyHost, "proxy_host", { id: hostId });
				if (status.nginx_err)
					throw new errs.ConfigurationError(
						"Revision activation failed; previous host configuration restored",
					);
				revision = await service.record(access, hostId, "restored");
				await withHostDomainClaims(
					{ hostType: "proxy", hostId, domainNames: candidate.domain_names },
					async () => {},
				);
			} catch (error) {
				await rethrowAfterHostRollback(error, {
					hostId,
					operation: "restore",
					restore: () => restoreHostState(current),
					reload: () => internalNginx.reload(),
				});
			}
			await notifyProxyHostDomainsChanged();
			const { reconcileRestoredHost } = await import("./proxy-host.js");
			await reconcileRestoredHost(current.host, candidate);
			await internalAuditLog.add(access, {
				action: "updated",
				object_type: "proxy-host",
				object_id: hostId,
				meta: { revision_id: revision.id, restored_from_revision: revisionId },
			});
			return revision;
		}),
};
export default service;
