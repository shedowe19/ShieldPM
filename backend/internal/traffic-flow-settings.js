import fs from "node:fs";
import errs from "../lib/error.js";
import { detectNativeFlow } from "../lib/traffic-flow-capability.js";
import {
	FLOW_SETTING_ID,
	flowRuntime,
	flowSettings,
	setFlowConfigurationFailed,
	setFlowSettings,
	withFlowSettings,
} from "../lib/traffic-flow-settings.js";
import { global as logger } from "../logger.js";
import ProxyHost from "../models/proxy_host.js";
import Setting from "../models/setting.js";
import nginx from "./nginx.js";
import collector from "./traffic-flow.js";

export function validateFlowSettings(meta) {
	if (
		!meta ||
		typeof meta !== "object" ||
		Array.isArray(meta) ||
		Object.keys(meta).length !== 3 ||
		typeof meta.enabled !== "boolean" ||
		typeof meta.live_enabled !== "boolean" ||
		!["prefix", "address", "hidden"].includes(meta.client_mode)
	) {
		throw new errs.ValidationError(
			"Traffic Flow requires enabled and live_enabled booleans and client_mode prefix, address or hidden.",
		);
	}
	return { enabled: meta.enabled, live_enabled: meta.live_enabled, client_mode: meta.client_mode };
}

/** All hosts are rebuilt under the same engine lock as individual host edits.
 * Backups survive both the database commit and the validated reload. */
async function activate(policy, available, persist) {
	const hosts = await ProxyHost.query().where("is_deleted", 0).select("id");
	const backedUp = [];
	let activated = false;
	try {
		await withFlowSettings(policy, available, async () => {
			for (const snapshot of hosts) {
				const host = await nginx.getCurrentHost(ProxyHost, "proxy_host", snapshot.id);
				if (!host || host.is_deleted) continue;
				// Startup isolation intentionally leaves failed hosts without an active file.
				if (!fs.existsSync(nginx.getConfigName("proxy_host", host.id))) continue;
				await nginx.backupConfig("proxy_host", host);
				backedUp.push(host);
				await nginx.generateConfig("proxy_host", host);
			}
			await nginx.test();
			if (persist) {
				await Setting.transaction(async (trx) => {
					await Setting.query(trx)
						.where({ id: FLOW_SETTING_ID })
						.patch({ value: "configured", meta: policy });
					activated = true;
					await nginx.reload();
				});
			} else {
				activated = true;
				await nginx.reload();
			}
		});
	} catch (error) {
		// Remove newly created files too: a missing backup means no previous listener.
		const restored = await Promise.allSettled(
			backedUp.map(async (host) => {
				await nginx.deleteFile(nginx.getConfigName("proxy_host", host.id));
				await nginx.restoreConfig("proxy_host", host);
			}),
		);
		if (restored.some((result) => result.status === "rejected")) {
			throw new errs.ConfigurationError(
				"Traffic Flow rollback failed; configuration was not reloaded. Check server logs.",
			);
		}
		await nginx.test();
		if (activated) await nginx.reload(); // reload validates restored bytes before any signal
		const restoredError = new errs.ValidationError(
			`Could not apply Traffic Flow settings. Previous settings and configuration restored: ${error.message}`,
		);
		restoredError.flowRollbackComplete = true;
		throw restoredError;
	}
	// Commit in-memory policy only after durable commit. Privacy changes discard every old sample.
	collector.stop();
	setFlowSettings(policy, available);
	collector.start();
	for (const host of backedUp) {
		try {
			await nginx.deleteBackupConfig("proxy_host", host);
		} catch (error) {
			logger.error(`Traffic Flow backup cleanup failed: ${error.message}`);
		}
	}
}

const service = {
	async initialize() {
		const row = await Setting.query().where({ id: FLOW_SETTING_ID }).first();
		if (!row) throw new errs.ConfigurationError("Traffic Flow settings migration is missing.");
		setFlowSettings(validateFlowSettings(row.meta), await detectNativeFlow());
	},
	async reconcileStartup() {
		try {
			await nginx.withConfigurationLock(() => activate(flowSettings(), flowRuntime().native_available, false));
		} catch (error) {
			if (!error.flowRollbackComplete) throw error;
			// Preserve the existing startup isolation contract: a restored configuration
			// must leave the admin UI available to repair the affected host.
			logger.error(error.message);
			collector.stop();
			setFlowConfigurationFailed(true);
			collector.start();
		}
	},
	async update(data) {
		if (data.value !== undefined && data.value !== "configured")
			throw new errs.ValidationError("Invalid Traffic Flow setting value.");
		const policy = validateFlowSettings(data.meta);
		await nginx.withConfigurationLock(async () => {
			await activate(policy, await detectNativeFlow(), true);
		});
		const row = await Setting.query().where({ id: FLOW_SETTING_ID }).first();
		return { ...row, runtime: flowRuntime() };
	},
};
export default service;
