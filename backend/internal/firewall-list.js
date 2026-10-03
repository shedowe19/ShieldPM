import _ from "lodash";
import errs from "../lib/error.js";
import { parseIpList } from "../lib/firewall-addresses.js";
import { fetchIpList } from "../lib/firewall-download.js";
import { normalizeListInput } from "../lib/firewall-list-validation.js";
import { access as logger } from "../logger.js";
import firewallListModel from "../models/firewall_list.js";
import proxyHostModel from "../models/proxy_host.js";
import internalAuditLog from "./audit-log.js";

const fields = [
	"id",
	"created_on",
	"modified_on",
	"owner_user_id",
	"name",
	"reason",
	"description",
	"source_type",
	"source_url",
	"update_interval_hours",
	"enabled",
	"entry_count",
	"last_updated_on",
	"last_error",
];
const editFields = [
	"name",
	"reason",
	"description",
	"source_type",
	"source_url",
	"update_interval_hours",
	"enabled",
	"entries",
];
const listOperations = new Map();
const lastAttempts = new Map();
let timer = null;
let processing = false;
let pendingProcess = Promise.resolve();

const isDue = (row) => {
	const lastUpdate = row.last_updated_on ? new Date(row.last_updated_on).getTime() : 0;
	return (
		Date.now() - (Number.isFinite(lastUpdate) ? lastUpdate : 0) >= row.update_interval_hours * 3600000 &&
		Date.now() - (lastAttempts.get(row.id) || 0) >= 15 * 60000
	);
};

const withListLock = async (id, callback) => {
	const previous = listOperations.get(id) || Promise.resolve();
	const operation = previous.catch(() => {}).then(callback);
	listOperations.set(id, operation);
	try {
		return await operation;
	} finally {
		if (listOperations.get(id) === operation) listOperations.delete(id);
	}
};

const policyForHost = (host) => {
	let meta = host.meta;
	if (typeof meta === "string") {
		try {
			meta = JSON.parse(meta);
		} catch {
			return {};
		}
	}
	return meta?.ip_firewall || {};
};

const referenceHosts = async (id) => {
	const hosts = await proxyHostModel.query().select("id", "enabled", "meta").where("is_deleted", 0);
	return hosts.filter((host) => policyForHost(host).list_ids?.includes(id));
};

const publicRow = (row, includeEntries = true) => _.pick(row, includeEntries ? [...fields, "entries"] : fields);
const errorMessage = (error) => String(error?.message || "Firewall list refresh failed").slice(0, 1024);
const triggerAutoPush = async () => {
	const { default: gitops } = await import("./gitops.js");
	gitops.triggerAutoPush("firewall-list");
};

const checkedEntries = (content, remote = false) => {
	const parsed = parseIpList(content);
	if (parsed.invalid.length) {
		throw new errs.ValidationError(
			`Invalid firewall list entries on line(s): ${parsed.invalid
				.slice(0, 10)
				.map((item) => item.line)
				.join(", ")}`,
		);
	}
	if (remote && !parsed.entries.length) {
		throw new errs.ValidationError("Downloaded firewall list is empty; the previous list was retained");
	}
	return {
		entries: parsed.entries.join("\n"),
		entry_count: parsed.entries.length,
		last_updated_on: new Date().toISOString(),
		last_error: null,
	};
};

const prepare = async (data, previous = null) => {
	const combined = normalizeListInput(data, previous);
	const result = _.omit(combined, "entries");
	if (combined.source_type === "manual") {
		result.source_url = "";
		if (!previous || Object.hasOwn(data, "entries") || previous.source_type !== "manual") {
			Object.assign(result, checkedEntries(combined.entries));
		}
	} else {
		if (Object.hasOwn(data, "entries")) {
			throw new errs.ValidationError("URL firewall lists fetch their entries from the configured source");
		}
		if (
			previous?.source_type !== "url" ||
			previous.source_url !== combined.source_url ||
			(combined.enabled && !previous.entry_count)
		) {
			Object.assign(result, checkedEntries(await fetchIpList(combined.source_url), true));
		}
	}
	return result;
};

/** Apply list data and host configurations under the same Nginx serialization lock. */
const applyList = async (previous, patch) => {
	const { default: nginx } = await import("./nginx.js");
	return nginx.withConfigurationLock(async () => {
		const current = await firewallListModel.query().findById(previous.id).where("is_deleted", 0);
		if (
			!current ||
			!_.isEqual(
				_.pick(current, [...editFields, "modified_on"]),
				_.pick(previous, [...editFields, "modified_on"]),
			)
		) {
			throw new errs.ValidationError("Firewall list changed during this operation; reload and try again");
		}
		const hosts = (await referenceHosts(previous.id)).filter((host) => host.enabled && policyForHost(host).enabled);
		const stages = [];
		let updated;
		try {
			updated = await firewallListModel.query().patchAndFetchById(previous.id, patch);
			for (const host of hosts) {
				stages.push(
					await nginx.configureHost(proxyHostModel, "proxy_host", host, {
						defer_validation: true,
						skip_reload: true,
					}),
				);
			}
			if (stages.length) {
				await nginx.test();
				await nginx.reload();
			}
		} catch (error) {
			// Restore DB before files: any subsequent render sees the last working list.
			await firewallListModel
				.query()
				.where("id", previous.id)
				.patch(_.pick(previous, [...editFields, "entry_count", "last_updated_on", "last_error"]));
			const rollbacks = await Promise.allSettled(stages.map((stage) => nginx.rollbackStagedConfig(stage, error)));
			for (const rollback of rollbacks) {
				if (rollback.status === "rejected")
					logger.error(`Firewall configuration rollback failed: ${errorMessage(rollback.reason)}`);
			}
			if (stages.length) {
				try {
					await nginx.reload();
				} catch (restoreError) {
					logger.error(`Firewall previous configuration reload failed: ${errorMessage(restoreError)}`);
				}
			}
			throw new errs.ConfigurationError(
				`Firewall list update failed; previous list retained: ${errorMessage(error)}`,
			);
		}
		// Activation succeeded. Status/backup cleanup must not turn it into a failed data update.
		for (const stage of stages) {
			try {
				await nginx.commitStagedConfig(stage);
			} catch (error) {
				logger.error(`Firewall configuration status cleanup failed: ${errorMessage(error)}`);
			}
		}
		return updated;
	});
};

const recordError = async (id, error) => {
	await firewallListModel
		.query()
		.where("id", id)
		.where("is_deleted", 0)
		.patch({ last_error: errorMessage(error) });
};

const refreshList = async (previous) => {
	if (previous.source_type !== "url") throw new errs.ValidationError("Only URL firewall lists can be refreshed");
	lastAttempts.set(previous.id, Date.now());
	try {
		const patch = checkedEntries(await fetchIpList(previous.source_url), true);
		return await applyList(previous, patch);
	} catch (error) {
		await recordError(previous.id, error);
		throw error;
	}
};

const internalFirewallList = {
	/** @param {import("../lib/types.js").Access} access @param {Object} data */
	create: async (access, data) => {
		await access.can("access_lists:create", data);
		const prepared = await prepare(data);
		const row = await firewallListModel.query().insertAndFetch({
			...prepared,
			owner_user_id: access.token.getUserId(1),
			is_deleted: false,
		});
		await internalAuditLog.add(access, {
			action: "created",
			object_type: "firewall-list",
			object_id: row.id,
			meta: publicRow(row, false),
		});
		await triggerAutoPush();
		return publicRow(row);
	},

	/** @param {import("../lib/types.js").Access} access @param {{id:number}} data */
	get: async (access, data) => {
		const permissions = await access.can("access_lists:get", data.id);
		const query = firewallListModel.query().where("is_deleted", 0).findById(data.id);
		if (permissions.permission_visibility !== "all") query.where("owner_user_id", access.token.getUserId(1));
		const row = await query;
		if (!row) throw new errs.ItemNotFoundError(data.id);
		return publicRow(row);
	},

	/** @param {import("../lib/types.js").Access} access */
	getAll: async (access) => {
		const permissions = await access.can("access_lists:list");
		const query = firewallListModel
			.query()
			.select(...fields)
			.where("is_deleted", 0)
			.orderBy("name", "ASC");
		if (permissions.permission_visibility !== "all") query.where("owner_user_id", access.token.getUserId(1));
		return await query;
	},

	/** @param {import("../lib/types.js").Access} access @param {Object} data */
	update: async (access, data) => {
		await access.can("access_lists:update", data);
		return withListLock(data.id, async () => {
			const previous = await internalFirewallList.get(access, { id: data.id });
			const updated = await applyList(previous, await prepare(data, previous));
			await internalAuditLog.add(access, {
				action: "updated",
				object_type: "firewall-list",
				object_id: data.id,
				meta: publicRow(updated, false),
			});
			await triggerAutoPush();
			return publicRow(updated);
		});
	},

	/** @param {import("../lib/types.js").Access} access @param {{id:number}} data */
	delete: async (access, data) => {
		await access.can("access_lists:delete", data.id);
		return withListLock(data.id, async () => {
			const { default: nginx } = await import("./nginx.js");
			const previous = await nginx.withConfigurationLock(async () => {
				const row = await internalFirewallList.get(access, data);
				if ((await referenceHosts(data.id)).length) {
					throw new errs.ValidationError(
						"Firewall list is still assigned to a proxy host; remove its assignments first",
					);
				}
				await firewallListModel.query().where("id", data.id).patch({ is_deleted: true });
				return row;
			});
			await internalAuditLog.add(access, {
				action: "deleted",
				object_type: "firewall-list",
				object_id: data.id,
				meta: publicRow(previous, false),
			});
			lastAttempts.delete(data.id);
			await triggerAutoPush();
			return true;
		});
	},

	/** @param {import("../lib/types.js").Access} access @param {{id:number}} data */
	refresh: async (access, data) => {
		await access.can("access_lists:update", data);
		return withListLock(data.id, async () => {
			const row = await refreshList(await internalFirewallList.get(access, data));
			await internalAuditLog.add(access, {
				action: "updated",
				object_type: "firewall-list",
				object_id: data.id,
				meta: publicRow(row, false),
			});
			await triggerAutoPush();
			return publicRow(row);
		});
	},

	/** @param {import("../lib/types.js").Access} access @param {{entries:string}} data */
	preview: async (access, data) => {
		await access.can("access_lists:list");
		const parsed = parseIpList(data.entries);
		return { ...parsed, entry_count: parsed.entries.length };
	},

	/** Trusted final reference check, called inside the Nginx lock immediately before a host DB write. */
	assertExistForHost: async (listIds) => {
		if (!listIds?.length) return;
		const rows = await firewallListModel.query().select("id").whereIn("id", listIds).where("is_deleted", 0);
		const existingIds = new Set(rows.map((row) => row.id));
		for (const id of listIds) {
			if (!existingIds.has(id)) throw new errs.ValidationError(`Firewall list ${id} no longer exists`);
		}
	},

	/** Trusted renderer only; preserve host selection order for matching-rule priority. */
	getForHost: async (listIds) => {
		if (!listIds?.length) return [];
		const rows = await firewallListModel.query().whereIn("id", listIds).where("is_deleted", 0);
		return listIds.flatMap((id) => {
			const row = rows.find((item) => item.id === id);
			if (!row) throw new errs.ConfigurationError(`Firewall list ${id} no longer exists`);
			if (!row.enabled) return [];
			const parsed = parseIpList(row.entries);
			if (parsed.invalid.length)
				throw new errs.ConfigurationError(`Firewall list ${id} contains invalid entries`);
			return [{ id: row.id, name: row.name, reason: row.reason, entries: parsed.entries }];
		});
	},

	/** Refresh due subscriptions, one at a time, retaining the working data on errors. */
	process: async () => {
		if (processing) return;
		processing = true;
		let finishProcessing;
		pendingProcess = new Promise((resolve) => {
			finishProcessing = resolve;
		});
		try {
			const lists = await firewallListModel
				.query()
				.where("is_deleted", 0)
				.where("source_type", "url")
				.where("enabled", 1);
			for (const row of lists) {
				if (!isDue(row)) continue;
				try {
					await withListLock(row.id, async () => {
						const current = await firewallListModel.query().findById(row.id).where("is_deleted", 0);
						if (current?.enabled && current.source_type === "url" && isDue(current)) {
							await refreshList(current);
							await triggerAutoPush();
						}
					});
				} catch (error) {
					logger.error(`Firewall list #${row.id} refresh failed: ${errorMessage(error)}`);
				}
			}
		} catch (error) {
			logger.error(`Firewall subscription scheduler failed: ${errorMessage(error)}`);
		} finally {
			processing = false;
			finishProcessing();
		}
	},

	initTimer: () => {
		internalFirewallList.stopTimer();
		timer = setInterval(() => void internalFirewallList.process(), 60000);
		timer.unref?.();
		void internalFirewallList.process();
	},

	stopTimer: () => {
		if (timer) clearInterval(timer);
		timer = null;
		return pendingProcess;
	},
};

export default internalFirewallList;
